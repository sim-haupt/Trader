const { createHash } = require("node:crypto");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { completedBars, marketDayKey, marketTime, shiftDay } = require("../utils/marketSession");
const { summarizePremarket, classifyPremarket } = require("../utils/premarketMetrics");
const { fetchScanBars } = require("./market-data.service");

const CHECKPOINTS = ["04:30", "06:00", "07:00", "08:00", "09:00", "09:25"];
const FEED = "sip";
const DATA_DELAY_MS = Math.max(1, Number(process.env.PREMARKET_DATA_DELAY_MINUTES ?? 16) || 16) * 60_000;
const DEFAULT_SCAN = { symbols: [], minDollarVolume: 100_000, automatic: false };
const activeCaptures = new Map();

function getScope(scan) {
  return {
    userId: scan.userId,
    universeKey: createHash("sha256").update(JSON.stringify([scan.symbols, scan.minDollarVolume])).digest("hex"),
    feed: FEED
  };
}

async function getScan(userId) {
  return (await prisma.premarketScan.findUnique({ where: { userId } })) ?? { userId, ...DEFAULT_SCAN };
}

function snapshotKey(scope, dayKey, checkpoint) {
  return { userId_universeKey_feed_dayKey_checkpoint: { ...scope, dayKey, checkpoint } };
}

function canCapture(cutoff, now = new Date()) {
  return cutoff.getTime() + DATA_DELAY_MS <= now.getTime();
}

async function performCapture(scan, dayKey, checkpoint) {
  if (!scan.symbols.length) throw new ApiError(400, "Save the symbols you scan before collecting snapshots.");
  const scope = getScope(scan);
  const where = snapshotKey(scope, dayKey, checkpoint);
  const existing = await prisma.premarketSnapshot.findUnique({ where });
  if (existing) return existing;

  const cutoff = marketTime(dayKey, checkpoint);
  if (!canCapture(cutoff)) {
    throw new ApiError(400, `This checkpoint is available ${DATA_DELAY_MS / 60_000} minutes after its ET cutoff.`);
  }

  const start = marketTime(dayKey, "04:00");
  const previousDayEnd = new Date(marketTime(dayKey, "00:00").getTime() - 1);
  const anchorSymbols = [...new Set(["SPY", ...scan.symbols])];
  const [daily, minutes, previous] = await Promise.all([
    fetchScanBars(anchorSymbols, "1Day", marketTime(shiftDay(dayKey, -14), "00:00"), previousDayEnd, FEED, dayKey),
    fetchScanBars(anchorSymbols, "1Min", start, cutoff, FEED, dayKey),
    prisma.premarketSnapshot.findMany({
      where: { ...scope, checkpoint, dayKey: { lt: dayKey } },
      orderBy: { dayKey: "desc" },
      take: 60,
      select: { metrics: true }
    })
  ]);

  const mostRecentSession = daily.get("SPY")?.at(-1)?.time;
  if (!mostRecentSession || !completedBars(minutes.get("SPY") ?? [], cutoff).length) {
    throw new ApiError(422, "No completed premarket bars were returned. Check the session date, symbols, and SIP access.");
  }

  for (const [symbol, bars] of daily) daily.set(symbol, bars.filter(({ time }) => time === mostRecentSession));
  for (const [symbol, bars] of minutes) minutes.set(symbol, completedBars(bars, cutoff));
  const summary = summarizePremarket(scan.symbols, minutes, daily, cutoff, scan.minDollarVolume);
  const { heat, cycle } = classifyPremarket(summary, previous.map(({ metrics }) => metrics));
  const metrics = { ...summary, entryHeat: heat, entryCycle: cycle };

  try {
    return await prisma.premarketSnapshot.create({ data: { ...scope, dayKey, checkpoint, cutoff, metrics } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    return prisma.premarketSnapshot.findUniqueOrThrow({ where });
  }
}

async function capture(scan, dayKey, checkpoint) {
  const key = JSON.stringify(snapshotKey(getScope(scan), dayKey, checkpoint));
  if (activeCaptures.has(key)) return activeCaptures.get(key);
  const operation = performCapture(scan, dayKey, checkpoint).finally(() => activeCaptures.delete(key));
  activeCaptures.set(key, operation);
  return operation;
}

async function getPremarketAtFill(userId, fillTime) {
  const dayKey = marketDayKey(fillTime);
  if (fillTime < marketTime(dayKey, "04:00") || fillTime >= marketTime(dayKey, "09:30")) return null;

  const scan = await getScan(userId);
  if (!scan.symbols.length) return null;
  const snapshot = await prisma.premarketSnapshot.findFirst({
    where: { ...getScope(scan), dayKey, cutoff: { lte: fillTime }, recordedAt: { lte: fillTime } },
    orderBy: { cutoff: "desc" },
    select: { checkpoint: true, metrics: true }
  });
  if (!snapshot) return null;
  return {
    checkpoint: snapshot.checkpoint,
    heat: snapshot.metrics.entryHeat ?? null,
    cycle: snapshot.metrics.entryCycle ?? null,
    breadth: snapshot.metrics.counts[0]
  };
}

async function getSnapshotSummary(userId, { from, to }, mode) {
  const scan = await getScan(userId);
  const rows = await prisma.premarketSnapshot.findMany({
    where: {
      ...getScope(scan),
      dayKey: {
        ...(from ? { gte: mode === "recap" ? shiftDay(from, -110) : from } : {}),
        ...(to ? { lte: to } : {})
      },
      ...(mode === "recap" ? { checkpoint: "09:25" } : {})
    },
    orderBy: [{ dayKey: "asc" }, { cutoff: "asc" }],
    select: { dayKey: true, cutoff: true, recordedAt: true, metrics: true }
  });

  if (mode === "entries") {
    return rows.map(({ dayKey, cutoff, recordedAt, metrics }) => ({
      dayKey, cutoff, recordedAt, heat: metrics.entryHeat ?? null
    }));
  }

  return rows.flatMap((row, index) => {
    if (from && row.dayKey < from) return [];
    const history = rows.slice(Math.max(0, index - 60), index).reverse().map(({ metrics }) => metrics);
    const { heat } = classifyPremarket(row.metrics, history);
    return [{ dayKey: row.dayKey, heat, breadth: row.metrics.counts[0], leader: row.metrics.top[0] ?? null }];
  });
}

module.exports = { CHECKPOINTS, getScan, capture, getPremarketAtFill, getSnapshotSummary };
