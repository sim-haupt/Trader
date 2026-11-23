const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { buildTradeWhere } = require("./trade.service");
const { getBars, getEntryQuote } = require("./market-data.service");
const { getPremarketAtFill } = require("./premarket.service");
const { completedBars, startOfMinute, marketDayKey, marketTime } = require("../utils/marketSession");
const { firstFill, calculateEntryOutcome } = require("../utils/entryReview");

const executionSelection = { orderBy: { sequence: "asc" } };
const tradeSelect = {
  id: true, symbol: true, side: true, strategy: true, entryPrice: true, entryDate: true,
  exitDate: true, exitPrice: true, reportedExecutionCount: true, executions: executionSelection, entryReview: true, analysis: true,
  grossPnl: true, netPnl: true, fees: true, commissions: true, quantity: true
};

async function findTrade(actor, id) {
  const trade = await prisma.trade.findFirst({ where: { ...buildTradeWhere(actor), id }, select: tradeSelect });
  if (!trade) throw new ApiError(404, "Trade not found");
  return trade;
}

async function listQueue(actor, { graded, before }) {
  return prisma.trade.findMany({
    where: {
      ...buildTradeWhere(actor),
      entryReview: graded ? { isNot: null } : { is: null },
      ...(before ? { OR: [{ entryDate: { lt: before.entryDate } }, { entryDate: before.entryDate, id: { lt: before.id } }] } : {})
    },
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
    take: 51,
    select: { id: true, symbol: true, entryDate: true }
  });
}

async function getBlindEntry(actor, id) {
  const trade = await findTrade(actor, id);
  const fill = firstFill(trade);
  const dayKey = marketDayKey(fill.time);
  const regularPremarketStart = marketTime(dayKey, "04:00");
  const from = fill.time >= regularPremarketStart
    ? regularPremarketStart
    : new Date(fill.time.getTime() - 3 * 60 * 60_000);
  const to = new Date(startOfMinute(fill.time).getTime() - 1);
  const [result, premarket] = await Promise.all([
    getBars({ symbol: trade.symbol, resolution: "1m", from, to, includeExtended: true })
      .catch((error) => ({ bars: [], feed: null, error: error.message })),
    getPremarketAtFill(actor.id, fill.time)
  ]);

  return {
    id, symbol: trade.symbol, side: trade.side, fill, dayKey, feed: result.feed,
    bars: completedBars(result.bars, fill.time),
    barsError: result.error ?? null,
    premarket,
    review: trade.entryReview ? {
      ...trade.entryReview,
      outcome: undefined,
      postRevealNotes: undefined
    } : null
  };
}

async function saveGrade(actor, id, input) {
  const trade = await findTrade(actor, id);
  if (trade.entryReview) return trade.entryReview;

  try {
    return await prisma.tradeEntryReview.create({ data: { tradeId: id, ...input } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    return prisma.tradeEntryReview.findUniqueOrThrow({ where: { tradeId: id } });
  }
}

async function getOutcome(actor, id) {
  const trade = await findTrade(actor, id);
  if (!trade.entryReview) throw new ApiError(409, "Save the blind grade before revealing the trade.");
  const fill = firstFill(trade);
  const collectedExecution = trade.analysis?.execution;
  const side = trade.side === "SHORT" ? -1 : 1;
  let analytics = collectedExecution ? {
    ...collectedExecution,
    slippagePerShare: fill.approximate || trade.entryReview.intendedPrice == null ? null : side * (fill.price - Number(trade.entryReview.intendedPrice))
  } : trade.entryReview.outcome;
  let dataMessage = null;

  if (!analytics) {
    const to = new Date(Math.max(trade.exitDate?.getTime() ?? 0, fill.time.getTime() + 15 * 60_000));
    // Request quotes independently so a missing entitlement never blocks the outcome.
    const [barResult, quoteResult] = await Promise.allSettled([
      getBars({ symbol: trade.symbol, resolution: "1m", from: startOfMinute(fill.time), to, includeExtended: true }),
      fill.approximate ? Promise.resolve(null) : getEntryQuote(trade.symbol, fill.time)
    ]);
    const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
    const result = barResult.status === "fulfilled" ? barResult.value : null;
    analytics = {
      ...calculateEntryOutcome(trade, fill, result?.bars ?? [], trade.entryReview.intendedPrice),
      quote,
      spreadPerShare: quote ? quote.ask - quote.bid : null,
      feed: result?.feed ?? null
    };

    if (result?.bars.length && trade.exitDate && to <= new Date(Date.now() - 16 * 60_000) && result.feed === "sip") {
      await prisma.tradeAnalysis.upsert({
        where: { tradeId: id }, create: { tradeId: id, execution: analytics }, update: { execution: analytics }
      });
    } else if (!result?.bars.length) {
      dataMessage = "Post-entry bars are unavailable for this window.";
    }
  }

  const netPnl = trade.grossPnl === null ? trade.netPnl : Number(trade.grossPnl) - Number(trade.commissions) - Number(trade.fees);
  return {
    netPnl,
    exitDate: trade.exitDate,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    executions: trade.executions,
    analytics,
    dataMessage,
    postRevealNotes: trade.entryReview.postRevealNotes
  };
}

async function saveReflection(actor, id, postRevealNotes) {
  const trade = await findTrade(actor, id);
  if (!trade.entryReview) throw new ApiError(409, "Save the blind grade before adding a reflection.");
  await prisma.tradeEntryReview.update({ where: { tradeId: id }, data: { postRevealNotes } });
}

module.exports = { listQueue, getBlindEntry, saveGrade, getOutcome, saveReflection };
