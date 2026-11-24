const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { buildTradeWhere } = require("./trade.service");
const { getBars } = require("./market-data.service");
const { firstFill, calculateEntryOutcome } = require("../utils/entryReview");
const { completedBars, startOfMinute, marketDayKey, marketTime } = require("../utils/marketSession");
const { exitTimingPlan, compareExitTiming, MINUTE, OFFSETS } = require("../utils/exitTiming");

const minute = 60_000;
const maxPathMs = 48 * 60 * minute;
const defaultProfile = { limits: {}, rules: [], tags: [] };

function profileKey(actor) {
  return { userId_accountScope: { userId: actor.id, accountScope: actor.activeAccountScope || "SIMULATOR" } };
}

async function getProfile(actor) {
  const row = await prisma.riskProfile.findUnique({ where: profileKey(actor) });
  return row ? { ...row.settings, simulation: row.simulation } : defaultProfile;
}

async function saveProfile(actor, settings) {
  const where = profileKey(actor);
  const row = await prisma.riskProfile.upsert({
    where, create: { ...where.userId_accountScope, settings }, update: { settings }
  });
  return { ...row.settings, simulation: row.simulation };
}

async function saveSimulation(actor, simulation) {
  const where = profileKey(actor);
  const row = await prisma.riskProfile.upsert({
    where, create: { ...where.userId_accountScope, settings: defaultProfile, simulation }, update: { simulation }
  });
  return { ...row.settings, simulation: row.simulation };
}

async function findTrade(actor, id) {
  const trade = await prisma.trade.findFirst({
    where: { ...buildTradeWhere(actor), id },
    include: { executions: { orderBy: { sequence: "asc" } }, entryReview: true, analysis: true }
  });
  if (!trade) throw new ApiError(404, "Trade not found");
  return trade;
}

async function saveTradeRecord(actor, id, patch) {
  const trade = await findTrade(actor, id);
  return prisma.tradeAnalysis.upsert({
    where: { tradeId: trade.id }, create: { tradeId: trade.id, ...patch }, update: patch
  });
}

async function completeOriginalRisk(actor, id, values) {
  const trade = await findTrade(actor, id);
  if (!trade.entryReview) throw new ApiError(409, "Save the original blind review to record its risk plan.");
  const fields = Object.keys(values).filter((field) => values[field] !== undefined && values[field] !== null);
  if (!fields.length) throw new ApiError(400, "Enter an original stop or dollar risk.");
  const updated = await prisma.tradeEntryReview.updateMany({
    where: { tradeId: id, ...Object.fromEntries(fields.map((field) => [field, null])) },
    data: Object.fromEntries(fields.map((field) => [field, values[field]]))
  });
  if (!updated.count) throw new ApiError(409, "One of those original values is already recorded.");
  return prisma.tradeEntryReview.findUniqueOrThrow({
    where: { tradeId: id },
    select: { plannedStop: true, plannedInitialRisk: true }
  });
}

async function replay(actor, id, elapsed) {
  const trade = await findTrade(actor, id);
  const fill = firstFill(trade);
  const entryMinute = startOfMinute(fill.time);
  const tradingStart = marketTime(marketDayKey(fill.time), "04:00");
  const from = new Date(Math.min(entryMinute.getTime() - 10 * minute,
    Math.max(tradingStart.getTime(), entryMinute.getTime() - 60 * minute)));
  const latest = Math.min(Date.now(), entryMinute.getTime() + maxPathMs);
  const maxSteps = Math.max(0, Math.ceil((latest - from.getTime()) / minute));
  const step = Math.min(elapsed, maxSteps);
  const cutoff = new Date(Math.min(from.getTime() + step * minute, latest));
  const response = await getBars({
    symbol: trade.symbol, resolution: "1m", from, to: new Date(latest), includeExtended: true
  });
  const bars = completedBars(response.bars, cutoff).filter((bar) => bar.time * 1000 >= from.getTime());
  const reported = trade.reportedExecutionCount;
  const executions = trade.executions.filter((execution) => execution.occurredAt <= cutoff &&
    (execution.source === "IMPORTED" || reported === 2));
  if (!trade.executions.length && (reported == null || reported <= 2)) {
    if (trade.entryDate <= cutoff) executions.push({
      id: "reported-entry", occurredAt: trade.entryDate, price: trade.entryPrice, action: fill.action,
      source: "SYNTHETIC", markerLabel: "Reported entry"
    });
    if (trade.exitDate && trade.exitPrice != null && trade.exitDate <= cutoff) executions.push({
      id: "reported-exit", occurredAt: trade.exitDate, price: trade.exitPrice,
      action: fill.action === "BUY" ? "SELL" : "BUY", source: "SYNTHETIC", markerLabel: "Reported exit"
    });
  }
  const actualExecutions = executions.filter(({ source }) => source === "IMPORTED");
  const result = calculateEntryOutcome({ ...trade, executions: actualExecutions, exitDate: cutoff }, fill, bars, null, { replay: true });
  return {
    symbol: trade.symbol, dayKey: marketDayKey(fill.time), from, cutoff, step, maxSteps, feed: response.feed,
    bars, executions, excursion: { mfe: result.mfe, mae: result.mae, mfePoint: result.mfePoint, maePoint: result.maePoint },
    stop: trade.entryReview?.plannedStop ?? null, target: trade.analysis?.intendedExit ?? null,
    notes: trade.analysis?.replayNotes ?? ""
  };
}

async function getSimulationPath(actor, id) {
  const trade = await findTrade(actor, id);
  if (!trade.exitDate || trade.executions.length !== 2 ||
    trade.executions.some((execution) => execution.source !== "IMPORTED") ||
    trade.reportedExecutionCount > 2) {
    return { id, reason: "A single actual entry and exit fill are required." };
  }
  const [entry, exit] = trade.executions;
  if (entry.action === exit.action || Number(entry.quantity) !== Number(exit.quantity) ||
    exit.occurredAt <= entry.occurredAt || exit.occurredAt - entry.occurredAt > maxPathMs) {
    return { id, reason: "The closed fill pair is incomplete or exceeds the 48-hour path window." };
  }
  const result = await getBars({
    symbol: trade.symbol, resolution: "1m", from: startOfMinute(entry.occurredAt),
    to: exit.occurredAt, includeExtended: true
  });
  return {
    id, entry: entry.occurredAt, exit: exit.occurredAt, entryPrice: Number(entry.price),
    exitPrice: Number(exit.price), shares: Number(entry.quantity), feed: result.feed,
    bars: result.bars // Entry and exit boundary candles are handled explicitly by the simulator.
  };
}

async function getExitTiming(actor, id) {
  const trade = await findTrade(actor, id);
  const plan = exitTimingPlan(trade);
  if (plan.reason) return { reason: plan.reason };

  const now = Date.now();
  const from = startOfMinute(new Date(Math.max(plan.entry, plan.exit + (OFFSETS[0] - 1) * MINUTE)));
  const to = new Date(Math.min(now, plan.exit + OFFSETS.at(-1) * MINUTE));
  const result = from < to ? await getBars({ symbol: trade.symbol, resolution: "1m", from, to, includeExtended: true })
    .catch(() => ({ bars: [], feed: null })) : { bars: [], feed: null };
  return { actualNet: plan.actualNet, exit: plan.exit, approximate: plan.approximate, feed: result.feed,
    rows: compareExitTiming(plan, result.bars, now) };
}

async function getSimulationPaths(actor, ids) {
  const output = [];
  for (let index = 0; index < ids.length; index += 3) {
    output.push(...await Promise.all(ids.slice(index, index + 3).map(async (id) => {
      try {
        return await getSimulationPath(actor, id);
      } catch (error) {
        return { id, reason: error.statusCode === 404 ? "Trade not found." : "Historical price path is unavailable." };
      }
    })));
  }
  return output;
}

module.exports = { getProfile, saveProfile, saveSimulation, saveTradeRecord, completeOriginalRisk, replay, getSimulationPaths, getExitTiming };
