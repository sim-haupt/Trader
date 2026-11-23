const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { buildTradeWhere } = require("./trade.service");
const { fetchScanBars, getBars, getEntryQuote, getHistoricalNews } = require("./market-data.service");
const { firstFill, calculateEntryOutcome } = require("../utils/entryReview");
const { completedBars, startOfMinute, marketDayKey, marketTime, shiftDay } = require("../utils/marketSession");
const { buildEntrySnapshot, efficiency } = require("../utils/tradeIntelligence");

async function findTrade(actor, id) {
  const trade = await prisma.trade.findFirst({
    where: { id, ...buildTradeWhere(actor) },
    include: { executions: { orderBy: { sequence: "asc" } }, entryReview: true, analysis: true }
  });
  if (!trade) throw new ApiError(404, "Trade not found");
  return trade;
}

async function updatePlan(actor, id, { intendedExit, stopExecutionId }) {
  const trade = await findTrade(actor, id);
  if (stopExecutionId && !trade.executions.some((fill) => fill.id === stopExecutionId &&
    fill.source === "IMPORTED" && fill.action === (trade.side === "LONG" ? "SELL" : "BUY"))) {
    throw new ApiError(400, "Choose an actual exit fill for this trade.");
  }
  return prisma.tradeAnalysis.upsert({
    where: { tradeId: id }, create: { tradeId: id, intendedExit, stopExecutionId },
    update: { intendedExit, stopExecutionId }
  });
}

function sameTimeRvol(bars, daily, fill, nowVolume) {
  const dayKey = marketDayKey(fill.time);
  const offset = fill.time - marketTime(dayKey, "04:00");
  if (offset <= 0 || nowVolume == null) return null;
  const volumes = new Map(daily.filter((bar) => bar.time * 1000 >= marketTime(shiftDay(dayKey, -12), "00:00"))
    .map((bar) => [marketDayKey(new Date(bar.time * 1000)), 0]));
  const windows = new Map([...volumes.keys()].map((day) => {
    const start = marketTime(day, "04:00").getTime();
    return [day, [start, start + offset]];
  }));
  for (const bar of bars) {
    const time = bar.time * 1000;
    const day = marketDayKey(new Date(time));
    const range = windows.get(day);
    if (range && time >= range[0] && time + 60_000 <= range[1]) volumes.set(day, volumes.get(day) + bar.volume);
  }
  const baseline = [...volumes.values()];
  const typical = baseline.reduce((sum, volume) => sum + volume, 0) / baseline.length;
  return baseline.length >= 5 && typical > 0 ? nowVolume / typical : null;
}

async function collectSnapshot(trade, fill) {
  const day = marketDayKey(fill.time);
  const start = marketTime(day, "04:00");
  if (fill.time <= start) return null;
  const priorEnd = new Date(marketTime(day, "00:00") - 1);
  const end = new Date(startOfMinute(fill.time).getTime() - 1);
  // Require a consistent consolidated universe for historical comparisons.
  const symbols = [...new Set([trade.symbol, "SPY"])];
  const [minute, daily, history, news, adjusted] = await Promise.allSettled([
    fetchScanBars(symbols, "1Min", start, end, "sip", day, "raw"),
    fetchScanBars(symbols, "1Day", marketTime(shiftDay(day, -350), "00:00"), priorEnd, "sip", day, "split"),
    fetchScanBars([trade.symbol], "1Min", marketTime(shiftDay(day, -12), "04:00"), priorEnd, "sip", day, "raw"),
    getHistoricalNews(trade.symbol, new Date(fill.time - 36 * 3_600_000), fill.time),
    fetchScanBars([trade.symbol], "1Min", start, end, "sip", day)
  ]);
  const bars = completedBars(minute.value?.get(trade.symbol) || [], fill.time);
  const dailyBars = daily.value?.get(trade.symbol) || [];
  if (!bars.length && !dailyBars.length && !news.value?.length) return null;
  const volume = bars.length ? bars.reduce((sum, bar) => sum + bar.volume, 0) : null;
  const snapshot = await buildEntrySnapshot({
    fill, side: trade.side, bars, daily: dailyBars, benchmark: minute.value?.get("SPY") || [],
    benchmarkDaily: daily.value?.get("SPY") || [], news: news.value ?? null,
    adjustedMinutes: adjusted.value?.get(trade.symbol) || [],
    relativeVolume: history.value ? sameTimeRvol(history.value.get(trade.symbol) || [], dailyBars, fill, volume) : null,
    feed: "sip"
  });
  return snapshot;
}

async function collectExecution(trade, fill) {
  const exit = trade.exitDate;
  const lastFill = trade.executions.at(-1);
  const lastActual = exit && lastFill?.source === "IMPORTED" && lastFill.action !== fill.action ? lastFill : null;
  const horizon = new Date(fill.time.getTime() + 15 * 60_000);
  const end = exit > horizon ? exit : horizon;
  const start = fill.time;
  const nearExit = exit && new Date(Math.max(start.getTime(), exit.getTime() - 5 * 60_000));
  const [result, entryQuote, exitQuote] = await Promise.allSettled([
    getBars({ symbol: trade.symbol, resolution: "1m", from: startOfMinute(start), to: end, includeExtended: true }),
    fill.approximate ? null : getEntryQuote(trade.symbol, fill.time),
    lastActual ? getEntryQuote(trade.symbol, lastActual.occurredAt) : null
  ]);
  const bars = result.value?.bars || [];
  if (!bars.length && !entryQuote.value && !exitQuote.value) return null;
  const base = calculateEntryOutcome(trade, fill, bars, null);
  const afterEntry = completedBars(bars, new Date(start.getTime() + 5 * 60_000))
    .filter((bar) => bar.time * 1000 >= start.getTime());
  const beforeExit = exit ? completedBars(bars, exit).filter((bar) => bar.time * 1000 >= nearExit.getTime()) : [];
  return {
    ...base,
    feed: result.value?.feed ?? null,
    entryEfficiency: fill.approximate ? null : efficiency(afterEntry, fill.price, trade.side),
    exitEfficiency: lastActual ? efficiency(beforeExit, Number(lastActual.price), trade.side, true) : null,
    quote: entryQuote.value ?? null,
    spreadPerShare: entryQuote.value ? entryQuote.value.ask - entryQuote.value.bid : null,
    exitQuote: exitQuote.value ?? null
  };
}

async function refresh(actor, id) {
  const trade = await findTrade(actor, id);
  const fill = firstFill(trade);
  const [snapshot, execution] = await Promise.all([collectSnapshot(trade, fill), collectExecution(trade, fill)]);
  if (!snapshot && !execution) {
    if (trade.analysis?.collectedAt) return trade.analysis;
    throw new ApiError(422, "No historical bars, quotes, or news were available for this trade.");
  }
  // Update only successful portions. Plan edits can be submitted while data is loading.
  const updates = { collectedAt: new Date(), ...(snapshot ? { snapshot } : {}), ...(execution ? { execution } : {}) };
  return prisma.$transaction(async (tx) => {
    const unchanged = await tx.trade.updateMany({
      where: { id, updatedAt: trade.updatedAt }, data: { updatedAt: trade.updatedAt }
    });
    if (!unchanged.count) throw new ApiError(409, "Trade details changed during collection. Try again.");
    return tx.tradeAnalysis.upsert({ where: { tradeId: id }, create: { tradeId: id, ...updates }, update: updates });
  });
}

async function refreshBatch(actor, ids) {
  const unique = [...new Set(ids)];
  const results = [];
  async function collect(id) {
    try {
      await refresh(actor, id);
      return { id, status: "saved" };
    } catch (error) {
      return { id, status: "unavailable", message: error.statusCode && error.statusCode < 500 ? error.message : "Historical provider unavailable." };
    }
  }
  for (let index = 0; index < unique.length; index += 2) {
    results.push(...await Promise.all(unique.slice(index, index + 2).map(collect)));
  }
  return results;
}

module.exports = { updatePlan, refresh, refreshBatch };
