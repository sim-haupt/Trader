const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const buildTradePayload = require("../utils/buildTradePayload");
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

function getEffectiveTradeCosts(trade, actor) {
  const explicitFees = asNumber(trade?.fees, 0);

  if (explicitFees > 0) {
    return explicitFees;
  }

  return Number(
    (asNumber(actor?.defaultCommission, 0) + asNumber(actor?.defaultFees, 0)).toFixed(4)
  );
}

function getTradeNetPnl(trade, actor) {
  const grossPnl = trade?.grossPnl;
  const storedNetPnl = trade?.netPnl;
  const effectiveCosts = getEffectiveTradeCosts(trade, actor);

  if (grossPnl !== undefined && grossPnl !== null && grossPnl !== "") {
    return Number((asNumber(grossPnl, 0) - effectiveCosts).toFixed(4));
  }

  if (storedNetPnl !== undefined && storedNetPnl !== null && storedNetPnl !== "") {
    const baseNetPnl = asNumber(storedNetPnl, 0);
    return Number((baseNetPnl - (asNumber(trade?.fees, 0) > 0 ? 0 : effectiveCosts)).toFixed(4));
  }

  return Number((0 - effectiveCosts).toFixed(4));
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

  if (filters.strategy) {
    where.strategy = filters.strategy;
  }

  if (filters.from || filters.to) {
    where.entryDate = {};

    if (filters.from) {
      where.entryDate.gte = new Date(filters.from);
    }

    if (filters.to) {
      where.entryDate.lte = new Date(filters.to);
    }
  }

  return where;
}

async function findAccessibleTrade(actor, tradeId) {
  const trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      accountScope: getActorAccountScope(actor),
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
    }
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  return trade;
}

async function createTrade(actor, data) {
  const trade = await prisma.trade.create({
    data: buildTradePayload(data, actor.id, getActorAccountScope(actor))
  });

  if (data.tags) {
    await tagService.ensureTags(actor.id, data.tags);
  }

  if (data.strategy) {
    await strategyService.ensureStrategies(actor.id, data.strategy);
  }

  return trade;
}

async function getTrades(actor, filters) {
  const where = buildTradeWhere(actor, filters);

  return prisma.trade.findMany({
    where,
    include: hasGlobalTradeScope(actor, filters) ? adminTradeInclude : undefined,
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
      grossPnl: true,
      netPnl: true,
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
    const pnl = getTradeNetPnl(trade, actor);
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
    pnlType: "NET",
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
      defaultCommission: true,
      defaultFees: true
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
      defaultCommission: user.defaultCommission,
      defaultFees: user.defaultFees
    },
    filters
  );
}

async function getTradeTags(actor) {
  const tags = await tagService.listTags(actor);
  return tags.map((tag) => tag.name);
}

async function getTradeById(actor, tradeId) {
  let trade = await prisma.trade.findFirst({
    where: {
      id: tradeId,
      accountScope: getActorAccountScope(actor),
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
    },
    include: tradeDetailInclude
  });

  if (!trade) {
    throw new ApiError(404, "Trade not found");
  }

  if (trade.marketDataNeedsBackfill) {
    try {
      await refreshTradeImportContext(trade);
      trade = await prisma.trade.findFirst({
        where: {
          id: tradeId,
          accountScope: getActorAccountScope(actor),
          ...(actor.role === "ADMIN" ? {} : { userId: actor.id })
        },
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

  const trade = await prisma.trade.update({
    where: { id: tradeId },
    data: buildTradePayload(data, existingTrade.userId, existingTrade.accountScope)
  });

  if (data.tags) {
    await tagService.ensureTags(existingTrade.userId, data.tags);
  }

  if (data.strategy) {
    await strategyService.ensureStrategies(existingTrade.userId, data.strategy);
  }

  return trade;
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
  const strategy =
    payload.strategy === undefined ? undefined : payload.strategy === "" ? null : payload.strategy.trim();

  const data = {};

  if (nextTags !== undefined) {
    data.tags = nextTags;
  }

  if (notes !== undefined) {
    data.notes = notes;
  }

  if (strategy !== undefined) {
    data.strategy = strategy;
  }

  const trade = await prisma.trade.update({
    where: { id: tradeId },
    data,
    include: tradeDetailInclude
  });

  if (nextTags) {
    await tagService.ensureTags(existingTrade.userId, nextTags);
  }

  if (strategy) {
    await strategyService.ensureStrategies(existingTrade.userId, strategy);
  }

  return trade;
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

  return [...new Set([...current, ...incoming])].join(", ");
}

async function bulkUpdateTrades(actor, payload) {
  const uniqueTradeIds = [...new Set(payload.tradeIds)];

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

  const trades = await prisma.trade.findMany({
    where,
    select: {
      id: true,
      tags: true
    }
  });

  if (trades.length === 0) {
    return { updatedCount: 0 };
  }

  const notes =
    payload.notes === undefined ? undefined : payload.notes === "" ? null : payload.notes;
  const tagsMode = payload.tagsMode || "append";
  const strategy =
    payload.strategy === undefined ? undefined : payload.strategy === "" ? null : payload.strategy.trim();

  await prisma.$transaction(
    trades.map((trade) => {
      const nextTags =
        payload.tags === undefined
          ? undefined
          : payload.tags === ""
            ? null
            : tagsMode === "replace"
              ? payload.tags
              : mergeTagStrings(trade.tags, payload.tags);

      const data = {};

      if (nextTags !== undefined) {
        data.tags = nextTags;
      }

      if (notes !== undefined) {
        data.notes = notes;
      }

      if (strategy !== undefined) {
        data.strategy = strategy;
      }

      return prisma.trade.update({
        where: { id: trade.id },
        data
      });
    })
  );

  if (payload.tags) {
    const userIds = actor.role === "ADMIN"
      ? [...new Set((await prisma.trade.findMany({
          where: {
            id: {
              in: trades.map((trade) => trade.id)
            }
          },
          select: { userId: true }
        })).map((trade) => trade.userId))]
      : [actor.id];

    await Promise.all(userIds.map((userId) => tagService.ensureTags(userId, payload.tags)));
  }

  if (strategy) {
    const userIds = actor.role === "ADMIN"
      ? [...new Set((await prisma.trade.findMany({
          where: {
            id: {
              in: trades.map((trade) => trade.id)
            }
          },
          select: { userId: true }
        })).map((trade) => trade.userId))]
      : [actor.id];

    await Promise.all(userIds.map((userId) => strategyService.ensureStrategies(userId, strategy)));
  }

  return {
    updatedCount: trades.length
  };
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
      .map((trade) => String(trade.strategy || "").trim())
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
