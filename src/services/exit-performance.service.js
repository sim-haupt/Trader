const prisma = require("../config/prisma");
const { buildTradeWhere } = require("./trade.service");
const { getScalpMarketData, getScalpExitMarket, getScalpQuotes } = require("./market-data.service");
const { exitTimingPlan } = require("../utils/exitTiming");
const { WINDOW, makeExitPerformance } = require("../utils/exitPerformance");
const { startOfMinute } = require("../utils/marketSession");

const VERSION = 1;
const RETRY_MS = 15 * 60_000;
const pending = new Map();

function valid(record, trade) {
  return record && record.version === VERSION && record.sourceUpdatedAt.getTime() === trade.updatedAt.getTime();
}

async function getMarkets(trade, plan, mode, now) {
  const tickWindow = getScalpExitMarket(trade.symbol, plan.exit, WINDOW, mode, now);
  const quotes = mode === "minute" ? [] : getScalpQuotes(trade.symbol, new Date(plan.exit - 62_000),
    new Date(Math.min(now, plan.exit + 60_000))).catch(() => []);
  const hold = plan.exit - plan.entry;
  // Long holds use minute data to bound the per-trade request. First and last
  // partial intervals are excluded from peak calculations.
  const held = tickWindow.then((market) => {
    if (!market.partialWindow && hold <= WINDOW * 1000 && (mode === "minute" || market.resolution !== "minute")) return market;
    return hold <= 48 * 3600_000
      ? getScalpMarketData(trade.symbol, startOfMinute(new Date(plan.entry)), new Date(plan.exit), hold <= 900_000 ? mode : "minute")
      : { events: [], resolution: null };
  });
  return Promise.all([tickWindow, quotes, held]);
}

async function collect(trade, mode) {
  const compound = { tradeId: trade.id, mode };
  const original = trade.exitPerformance[0];
  if (valid(original, trade) && (original.metrics.hasData || Date.now() - original.collectedAt.getTime() < RETRY_MS)) return original.metrics;
  const key = `${trade.id}:${mode}:${trade.updatedAt.getTime()}`;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    const plan = exitTimingPlan(trade);
    let metrics = { reason: plan.reason, hasData: false };
    if (!plan.reason) {
      const now = Date.now();
      const [market, quotes, held] = await getMarkets(trade, plan, mode, now);
      metrics = makeExitPerformance(plan, market, quotes, held, now);
      metrics.hasData = Boolean(metrics.offsets.length || metrics.post.length || metrics.grossPeak != null);
      if (!metrics.hasData) metrics.reason = "Historical price coverage unavailable";
    }
    const data = { sourceUpdatedAt: trade.updatedAt, version: VERSION, metrics, collectedAt: new Date() };
    await prisma.tradeExitPerformance.upsert({
      where: { tradeId_mode: compound }, create: { ...compound, ...data }, update: data
    });
    return metrics;
  })().finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}

function project(id, result, offsets, windows) {
  if (!result) return { id, status: "pending" };
  const selectedOffsets = new Set(offsets.flatMap((seconds) => [-seconds, seconds]));
  const selectedWindows = new Set(windows);
  return { id, status: result.hasData ? "ready" : "unavailable",
    entry: result.entry, exit: result.exit, actualNet: result.actualNet, actualGross: result.actualGross,
    resolution: result.resolution, heldResolution: result.heldResolution, approximate: result.approximate,
    grossPeak: result.grossPeak, giveback: result.giveback, givebackPct: result.givebackPct, reason: result.reason,
    offsets: result.offsets?.filter(([seconds]) => selectedOffsets.has(seconds)) ?? [],
    post: result.post?.filter(([seconds]) => selectedWindows.has(seconds)) ?? [] };
}

async function getExitPerformanceBatch(actor, { ids, offsets, windows, mode }, shouldCollect) {
  const relation = { where: { mode } };
  const trades = await prisma.trade.findMany({
    where: { ...buildTradeWhere(actor), id: { in: [...new Set(ids)] }, exitDate: { not: null } },
    ...(shouldCollect ? { include: { exitPerformance: relation, executions: { orderBy: { sequence: "asc" } } } }
      : { select: { id: true, updatedAt: true, exitPerformance: relation } })
  });
  if (!shouldCollect) return trades.map((trade) => {
    const record = trade.exitPerformance[0];
    return project(trade.id, valid(record, trade) ? record.metrics : null, offsets, windows);
  });
  const rows = [];
  for (let i = 0; i < trades.length; i += 2) {
    rows.push(...await Promise.all(trades.slice(i, i + 2).map(async (trade) => {
      const result = await collect(trade, mode).catch((error) => {
        console.warn("Exit performance collection failed", error.code || error.name);
        return { reason: "Collection failed. Try again.", hasData: false };
      });
      return project(trade.id, result, offsets, windows);
    })));
  }
  return rows;
}

module.exports = { getExitPerformanceBatch };
