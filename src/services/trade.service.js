const prisma = require("../config/prisma");
const { Prisma } = require("@prisma/client");
const ApiError = require("../utils/ApiError");
const buildTradePayload = require("../utils/buildTradePayload");
const { getSetupFields } = buildTradePayload;
const parseNewYorkLocalDateTime = require("../utils/parseMarketDateTime");
const tagService = require("./tag.service");
const strategyService = require("./strategy.service");
const { refreshTradeImportContext } = require("./market-data.service");

const MARKET_TIME_ZONE = "America/New_York";

const adminTradeInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

const tradeDetailInclude = {
  analysis: true,
  entryReview: true,
  executions: {
    orderBy: {
      sequence: "asc"
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
};

const tradeListInclude = {
  analysis: true,
  entryReview: {
    select: {
      letterGrade: true, wouldRetake: true,
      notes: true, source: true, plannedInitialRisk: true, plannedStop: true, intendedPrice: true, outcome: true
    }
  },
  executions: {
    orderBy: {
      sequence: "asc"
    }
  }
};

function getActorAccountScope(actor) {
  return actor?.activeAccountScope || "SIMULATOR";
}

function hasGlobalTradeScope(actor, filters = {}) {
  return actor.role === "ADMIN" && filters.scope === "all";
}

function asNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? fallback : numericValue;
}

function getMarketDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });

  const parts = formatter.formatToParts(date);

  return Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );
}

function getMarketDayKey(date) {
  const parts = getMarketDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dayKeyToDate(dayKey) {
  const [year, month, day] = String(dayKey)
    .split("-")
    .map((value) => Number(value));

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function shiftDayKey(dayKey, amount) {
  const date = dayKeyToDate(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return getMarketDayKey(date);
}

function getStartOfCurrentWeekKey(currentDayKey) {
  const date = dayKeyToDate(currentDayKey);
  const dayOfWeek = date.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diff);
  return getMarketDayKey(date);
}

function formatLastSevenDayLabel(dayKey) {
  const date = dayKeyToDate(dayKey);

  return {
    label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    weekday: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
  };
}

function isWeekday(dayKey) {
  const dayOfWeek = dayKeyToDate(dayKey).getUTCDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getLastWeekdayKeys(endDayKey, count) {
  const keys = [];
  let cursor = endDayKey;

  while (keys.length < count) {
    if (isWeekday(cursor)) {
      keys.push(cursor);
    }

    cursor = shiftDayKey(cursor, -1);
  }

  return keys.reverse();
}

function getTradeCosts(trade) {
  return Number((asNumber(trade?.commissions, 0) + asNumber(trade?.fees, 0)).toFixed(4));
}

function getTradeNetPnl(trade) {
  const grossPnl = trade?.grossPnl;
  const storedNetPnl = trade?.netPnl;
  const costs = getTradeCosts(trade);

  if (grossPnl !== undefined && grossPnl !== null && grossPnl !== "") {
    return Number((asNumber(grossPnl, 0) - costs).toFixed(4));
  }

  if (storedNetPnl !== undefined && storedNetPnl !== null && storedNetPnl !== "") {
    return asNumber(storedNetPnl, 0);
  }

  return Number((0 - costs).toFixed(4));
}

function getTradeGrossPnl(trade) {
  if (trade?.grossPnl !== undefined && trade?.grossPnl !== null && trade.grossPnl !== "") {
    return asNumber(trade.grossPnl, 0);
  }

  if (trade?.netPnl !== undefined && trade?.netPnl !== null && trade.netPnl !== "") {
    return asNumber(trade.netPnl, 0);
  }

  return 0;
}

function parseTradeDateBoundary(value, boundary) {
  if (!value) {
    return null;
  }

  const stringValue = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return parseNewYorkLocalDateTime(
      `${stringValue}T${boundary === "end" ? "23:59:59" : "00:00:00"}`
    );
  }

  return parseNewYorkLocalDateTime(stringValue);
}

function getLiveDataStartBoundary(actor) {
  if (getActorAccountScope(actor) !== "LIVE" || !actor?.liveDataStartDate) {
    return null;
  }

  const dayKey =
    actor.liveDataStartDate instanceof Date
      ? actor.liveDataStartDate.toISOString().slice(0, 10)
      : String(actor.liveDataStartDate).slice(0, 10);

  return parseTradeDateBoundary(dayKey, "start");
}

function applyEntryDateLowerBound(where, lowerBound) {
  if (!lowerBound) {
    return;
  }

  where.entryDate = where.entryDate || {};

  if (!where.entryDate.gte || lowerBound > where.entryDate.gte) {
    where.entryDate.gte = lowerBound;
  }
}

function buildTradeWhere(actor, filters = {}) {
  const where = {};

  where.accountScope = getActorAccountScope(actor);

  if (!hasGlobalTradeScope(actor, filters)) {
    where.userId = actor.id;
  }

  if (filters.symbol) {
    where.symbol = filters.symbol.toUpperCase();
  }

  if (filters.side) {
    where.side = filters.side;
  }

  if (filters.tag) {
    where.tags = {
      contains: filters.tag,
      mode: "insensitive"
    };
  }

  const setupFilter = filters.setup || filters.strategy;

  if (setupFilter) {
    where.OR = [{ strategy: setupFilter }, { additionalSetups: { has: setupFilter } }];
  }

  if (filters.from || filters.to) {
    where.entryDate = {};

    if (filters.from) {
      where.entryDate.gte = parseTradeDateBoundary(filters.from, "start");
    }

    if (filters.to) {
      where.entryDate.lte = parseTradeDateBoundary(filters.to, "end");
    }
  }

  if (!hasGlobalTradeScope(actor, filters)) {
    applyEntryDateLowerBound(where, getLiveDataStartBoundary(actor));
  }

  return where;
}

async function findAccessibleTrade(actor, tradeId) {
  const where = {
    id: tradeId,
    accountScope: getActorAccountScope(actor),
    ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
  };

  if (actor.role !== "ADMIN") {
    applyEntryDateLowerBound(where, getLiveDataStartBoundary(actor));
  }

  const trade = await prisma.trade.findFirst({
    where
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  return trade;
}

async function saveManualGrade(tx, tradeId, grade) {
  if (!grade) return;
  const created = await tx.tradeEntryReview.createMany({
    data: { ...grade, tradeId, source: "MANUAL" }, skipDuplicates: true
  });
  if (created.count) return;

  const updated = await tx.tradeEntryReview.updateMany({
    where: { tradeId, source: "MANUAL" },
    data: { ...grade, gradedAt: new Date(), outcome: Prisma.DbNull }
  });
  if (!updated.count) throw new ApiError(409, "An existing blind entry grade is locked.");
}

async function ensureTradeLabels(tx, userId, tags, fields) {
  if (tags) await tagService.ensureTags(userId, tags, tx);
  const setups = [fields.strategy, ...(fields.additionalSetups ?? [])].filter(Boolean);
  if (setups.length) await strategyService.ensureStrategies(userId, setups, tx);
}

async function createTrade(actor, data) {
  const payload = buildTradePayload(data, actor.id, getActorAccountScope(actor));
  return prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        ...payload,
        ...(data.entryGrade && { entryReview: { create: { ...data.entryGrade, source: "MANUAL" } } })
      },
      include: { entryReview: true }
    });
    await ensureTradeLabels(tx, actor.id, data.tags, payload);
    return trade;
  });
}

async function getTrades(actor, filters) {
  const where = buildTradeWhere(actor, filters);

  return prisma.trade.findMany({
    where,
    include: hasGlobalTradeScope(actor, filters)
      ? {
          ...tradeListInclude,
          ...adminTradeInclude
        }
      : tradeListInclude,
    orderBy: {
      entryDate: "desc"
    }
  });
}

async function getWidgetSummary(actor, filters = {}) {
  return getWidgetSummaryForActor(actor, filters);
}

async function getWidgetSummaryForActor(actor, filters = {}) {
  const where = buildTradeWhere(actor, filters);
  const trades = await prisma.trade.findMany({
    where,
    select: {
      id: true,
      entryDate: true,
      quantity: true,
      grossPnl: true,
      netPnl: true,
      commissions: true,
      fees: true
    },
    orderBy: {
      entryDate: "asc"
    }
  });

  const currentDayKey = getMarketDayKey(new Date());
  const currentWeekStartKey = getStartOfCurrentWeekKey(currentDayKey);
  const currentMonthPrefix = currentDayKey.slice(0, 7);
  const dailyMap = new Map();

  let total = 0;
  let month = 0;
  let week = 0;
  let today = 0;
  let tradeCount = 0;
  let wins = 0;

  for (const trade of trades) {
    const pnl = getTradeGrossPnl(trade);
    const entryDate = new Date(trade.entryDate);
    const dayKey = getMarketDayKey(entryDate);
    const currentDayStats = dailyMap.get(dayKey) || { pnl: 0, trades: 0 };

    currentDayStats.pnl = Number((currentDayStats.pnl + pnl).toFixed(4));
    currentDayStats.trades += 1;
    dailyMap.set(dayKey, currentDayStats);

    total += pnl;
    tradeCount += 1;

    if (pnl > 0) {
      wins += 1;
    }

    if (dayKey.startsWith(currentMonthPrefix)) {
      month += pnl;
    }

    if (dayKey >= currentWeekStartKey && dayKey <= currentDayKey) {
      week += pnl;
    }

    if (dayKey === currentDayKey) {
      today += pnl;
    }
  }

  const lastSevenDays = getLastWeekdayKeys(currentDayKey, 7).map((dayKey) => {
    const stats = dailyMap.get(dayKey);
    const { label, weekday } = formatLastSevenDayLabel(dayKey);

    return {
      date: dayKey,
      label,
      weekday,
      pnl: Number((stats?.pnl || 0).toFixed(2)),
      trades: stats?.trades || 0
    };
  });

  return {
    pnlType: "GROSS",
    asOf: currentDayKey,
    cumulative: {
      total: Number(total.toFixed(2)),
      month: Number(month.toFixed(2)),
      week: Number(week.toFixed(2)),
      today: Number(today.toFixed(2))
    },
    winRate: tradeCount ? Number(((wins / tradeCount) * 100).toFixed(2)) : 0,
    tradeCount,
    wins,
    losses: tradeCount - wins,
    lastSevenDays
  };
}

async function getPublicWidgetSummary(userId, filters = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      activeAccountScope: true,
      liveDataStartDate: true
    }
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return getWidgetSummaryForActor(
    {
      id: user.id,
      role: "USER",
      activeAccountScope: user.activeAccountScope,
      liveDataStartDate: user.liveDataStartDate
    },
    filters
  );
}

async function getTradeTags(actor) {
  const tags = await tagService.listTags(actor);
  return tags.map((tag) => tag.name);
}

async function getTradeById(actor, tradeId) {
  const where = {
    id: tradeId,
    accountScope: getActorAccountScope(actor),
    ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
  };

  if (actor.role !== "ADMIN") {
    applyEntryDateLowerBound(where, getLiveDataStartBoundary(actor));
  }

  let trade = await prisma.trade.findFirst({
    where,
    include: tradeDetailInclude
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  if (trade.marketDataNeedsBackfill) {
    try {
      await refreshTradeImportContext(trade);
      trade = await prisma.trade.findFirst({
        where,
        include: tradeDetailInclude
      });
    } catch (error) {
      // Keep the trade accessible even if the deferred SIP backfill is not available yet.
    }
  }

  return trade;
}

async function updateTrade(actor, tradeId, data) {
  const existingTrade = await findAccessibleTrade(actor, tradeId);

  const payload = buildTradePayload(data, existingTrade.userId, existingTrade.accountScope);
  const changedBasis = ["symbol", "side", "entryDate", "exitDate", "entryPrice", "exitPrice", "quantity"]
    .some((field) => String(payload[field]) !== String(existingTrade[field]));
  if (data.tags === undefined) delete payload.tags;
  if (data.notes === undefined) delete payload.notes;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.trade.update({ where: { id: tradeId }, data: payload });
    await saveManualGrade(tx, tradeId, data.entryGrade);
    await ensureTradeLabels(tx, existingTrade.userId, data.tags, payload);
    if (changedBasis) {
      await tx.tradeAnalysis.updateMany({
        where: { tradeId }, data: { snapshot: Prisma.DbNull, execution: Prisma.DbNull, collectedAt: null }
      });
      await tx.tradeEntryReview.updateMany({ where: { tradeId }, data: { outcome: Prisma.DbNull } });
    }
    if (!data.entryGrade) return updated;
    const entryReview = await tx.tradeEntryReview.findUnique({ where: { tradeId } });
    return { ...updated, entryReview };
  });
}

async function updateTradeMeta(actor, tradeId, payload) {
  const existingTrade = await findAccessibleTrade(actor, tradeId);
  const tagsMode = payload.tagsMode || "append";

  const nextTags =
    payload.tags === undefined
      ? undefined
      : payload.tags === null || payload.tags === ""
        ? null
        : tagsMode === "replace"
          ? payload.tags
          : mergeTagStrings(existingTrade.tags, payload.tags);

  const notes =
    payload.notes === undefined ? undefined : payload.notes === "" ? null : payload.notes;
  const data = getSetupFields(payload);

  if (nextTags !== undefined) {
    data.tags = nextTags;
  }

  if (notes !== undefined) {
    data.notes = notes;
  }

  return prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.trade.update({ where: { id: tradeId }, data });
    await saveManualGrade(tx, tradeId, payload.entryGrade);
    await ensureTradeLabels(tx, existingTrade.userId, nextTags, data);
    return tx.trade.findUniqueOrThrow({ where: { id: tradeId }, include: tradeDetailInclude });
  });
}

async function deleteTrade(actor, tradeId) {
  await findAccessibleTrade(actor, tradeId);

  await prisma.trade.delete({
    where: {
      id: tradeId
    }
  });

  return {
    message: "Trade deleted successfully"
  };
}

async function bulkDeleteTrades(actor, tradeIds) {
  const uniqueTradeIds = [...new Set(tradeIds)];

  if (uniqueTradeIds.length === 0) {
    throw new ApiError(400, "At least one trade id is required");
  }

  const where = {
    id: {
      in: uniqueTradeIds
    }
  };

  if (actor.role !== "ADMIN") {
    where.userId = actor.id;
  }
  where.accountScope = getActorAccountScope(actor);

  const result = await prisma.trade.deleteMany({ where });

  return {
    deletedCount: result.count
  };
}

function mergeTagStrings(existingTags, incomingTags) {
  const current = String(existingTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const incoming = String(incomingTags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const merged = new Map();
  for (const tag of [...current, ...incoming]) {
    if (!merged.has(tag.toLowerCase())) merged.set(tag.toLowerCase(), tag);
  }
  return Array.from(merged.values()).join(", ");
}

function sameSetups(trade, next) {
  return trade.strategy === next.strategy && trade.additionalSetups.length === next.additionalSetups.length
    && trade.additionalSetups.every((value, index) => value === next.additionalSetups[index]);
}

async function applyBulkTradeUpdate(tx, actor, payload) {
  const trades = await tx.trade.findMany({
    where: { ...buildTradeWhere(actor, { scope: "all" }), id: { in: [...new Set(payload.tradeIds)] } },
    select: { id: true, userId: true, tags: true, strategy: true, additionalSetups: true, notes: true,
      entryReview: { select: { source: true, letterGrade: true } } },
    orderBy: { id: "asc" }
  });

  const legacySetup = payload.setup !== undefined ? payload.setup : payload.strategy;
  const requestedSetups = payload.setups ?? (legacySetup === undefined ? undefined : legacySetup ? [legacySetup] : []);
  const requestedSetupFields = getSetupFields({ setups: requestedSetups });
  const updated = new Set();
  const batches = new Map();
  const createGrades = [];
  const updateGradeIds = [];
  const grades = { updated: 0, skippedBlind: 0, skippedManual: 0 };
  const grade = payload.entryGrade?.letterGrade;

  for (const trade of trades) {
    const data = {};
    if (payload.tags !== undefined) {
      const tags = !payload.tags || payload.tagsMode === "replace" ? payload.tags || null : mergeTagStrings(trade.tags, payload.tags);
      if (tags !== trade.tags) {
        if (tags?.length > 500) throw new ApiError(400, "Adding these tags would exceed the 500-character limit on a selected trade.");
        data.tags = tags;
      }
    }
    if (requestedSetups !== undefined) {
      const next = payload.setups !== undefined && payload.setupsMode !== "replace"
        ? getSetupFields({ setups: [trade.strategy, ...trade.additionalSetups, ...requestedSetups].filter(Boolean) })
        : requestedSetupFields;
      if (!sameSetups(trade, next)) {
        if ((next.strategy ? 1 : 0) + next.additionalSetups.length > 30) {
          throw new ApiError(400, "Adding these setups would exceed the 30-setup limit on a selected trade.");
        }
        Object.assign(data, next);
      }
    }
    if (payload.notes !== undefined && (payload.notes || null) !== trade.notes) data.notes = payload.notes || null;
    if (Object.keys(data).length) {
      const key = JSON.stringify(data);
      if (!batches.has(key)) batches.set(key, { data, ids: [] });
      batches.get(key).ids.push(trade.id);
      updated.add(trade.id);
    }

    if (!grade) continue;
    if (trade.entryReview?.source === "BLIND") grades.skippedBlind += 1;
    else if (trade.entryReview && payload.gradeMode !== "replaceManual") grades.skippedManual += 1;
    else if (!trade.entryReview) createGrades.push({ tradeId: trade.id, source: "MANUAL", letterGrade: grade });
    else if (trade.entryReview.letterGrade !== grade) updateGradeIds.push(trade.id);
  }

  for (const { data, ids } of batches.values()) {
    await tx.trade.updateMany({ where: { id: { in: ids } }, data });
  }
  if (createGrades.length) {
    const result = await tx.tradeEntryReview.createMany({ data: createGrades });
    grades.updated += result.count;
    createGrades.forEach(({ tradeId }) => updated.add(tradeId));
  }
  if (updateGradeIds.length) {
    const result = await tx.tradeEntryReview.updateMany({
      where: { tradeId: { in: updateGradeIds }, source: "MANUAL" }, data: { letterGrade: grade, gradedAt: new Date() }
    });
    grades.updated += result.count;
    updateGradeIds.forEach((id) => updated.add(id));
  }

  const owners = new Set(trades.filter(({ id }) => updated.has(id)).map(({ userId }) => userId));
  for (const userId of owners) await ensureTradeLabels(tx, userId, payload.tags, requestedSetupFields);
  return { updatedCount: updated.size, matchedCount: trades.length, grades };
}

async function bulkUpdateTrades(actor, payload) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => applyBulkTradeUpdate(tx, actor, payload),
        { isolationLevel: "Serializable", timeout: 20_000 });
    } catch (error) {
      if (!["P2002", "P2034"].includes(error.code) || attempt >= 2) throw error;
    }
  }
}

async function deleteAllTrades(actor, options = {}) {
  const where = {};

  if (!(actor.role === "ADMIN" && options.scope === "all")) {
    where.userId = actor.id;
  }
  where.accountScope = getActorAccountScope(actor);

  const result = await prisma.trade.deleteMany({ where });

  return {
    deletedCount: result.count
  };
}

async function createManyTrades(userId, trades, accountScope = "SIMULATOR") {
  if (trades.length === 0) {
    return { count: 0 };
  }

  const result = await prisma.trade.createMany({
    data: trades.map((trade) => buildTradePayload(trade, userId, accountScope))
  });

  const tagValues = [...new Set(
    trades.flatMap((trade) =>
      String(trade.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )].join(", ");
  const strategyValues = [...new Set(
    trades
      .map((trade) => String(trade.setup || trade.strategy || "").trim())
      .filter(Boolean)
  )].join(", ");

  if (tagValues) {
    await tagService.ensureTags(userId, tagValues);
  }

  if (strategyValues) {
    await strategyService.ensureStrategies(userId, strategyValues);
  }

  return result;
}

module.exports = {
  buildTradeWhere,
  createTrade,
  getTrades,
  getWidgetSummary,
  getPublicWidgetSummary,
  getTradeTags,
  getTradeById,
  updateTrade,
  updateTradeMeta,
  deleteTrade,
  bulkDeleteTrades,
  bulkUpdateTrades,
  deleteAllTrades,
  createManyTrades
};
