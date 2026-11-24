const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { marketDayKey, marketTime, shiftDay } = require("../utils/marketSession");
const { summarizeMovers, sortMoverLists, BAR_MINUTES, AFTER_HOURS_END } = require("../utils/marketMovers");
const { fetchEquityAssets, fetchMarketCalendar, fetchScanBars } = require("./market-data.service");

const EXCHANGES = new Set(["AMEX", "ARCA", "BATS", "NYSE", "NASDAQ", "NYSEARCA", "TXSE"]);
const SIP_DELAY = 16 * 60_000;
const BATCH_SIZE = 200;
const PARALLEL_BATCHES = 4;
const NO_COVERAGE = "No comparable historical SIP prices were returned for this date.";
let symbolsCache;
let calendarCache;
let activeScan;

const errorMessage = (error) => {
  if ([401, 403, 503].includes(error.statusCode)) {
    return "Historical movers require access to Alpaca’s U.S. asset list, calendar, and historical SIP bars. Check the API configuration.";
  }
  if (error.statusCode === 429) return "Alpaca’s data limit was reached. Try the session again in a minute.";
  return "Alpaca data could not be loaded for this session. Try again shortly.";
};

async function getSymbols() {
  if (symbolsCache?.expires > Date.now()) return symbolsCache.symbols;
  const assets = await fetchEquityAssets();
  const symbols = [...new Set(assets.filter((asset) => EXCHANGES.has(asset.exchange)).map((asset) => asset.symbol)
    .filter((symbol) => typeof symbol === "string" && /^[A-Z][A-Z0-9.-]*$/.test(symbol)))].sort();
  if (!symbols.length) throw new Error("No listed symbols returned by Alpaca");
  symbolsCache = { symbols, expires: Date.now() + 6 * 3600_000 };
  return symbols;
}

async function getCalendar(around) {
  if (calendarCache?.expires > Date.now() && around >= calendarCache.from && around <= calendarCache.to) {
    return calendarCache.sessions;
  }
  const sessions = (await fetchMarketCalendar(shiftDay(around, -21), shiftDay(around, 21)))
    .sort((a, b) => a.date.localeCompare(b.date));
  calendarCache = { from: shiftDay(around, -7), to: shiftDay(around, 7), sessions, expires: Date.now() + 3600_000 };
  return sessions;
}

const readyAt = (day) => marketTime(day, AFTER_HOURS_END).getTime() + SIP_DELAY;

async function context(requested, now) {
  const today = marketDayKey(now);
  if (requested > today) throw new ApiError(400, "Choose a date on or before today in New York.");
  try {
    const sessions = await getCalendar(requested || today);
    const completed = sessions.filter(({ date }) => date <= today && readyAt(date) <= now.getTime());
    const day = requested || completed.at(-1)?.date || today;
    const previous = completed.findLast(({ date }) => date < day)?.date ?? null;
    const next = completed.find(({ date }) => date > day)?.date ?? null;
    const session = sessions.find(({ date }) => date === day);
    const navigation = { day, previous, next };
    if (!session) return { ...navigation, state: "closed" };
    if (readyAt(day) > now.getTime()) return { ...navigation, state: "incomplete" };
    return { ...navigation, session };
  } catch (error) {
    return { day: requested || today, state: "unavailable", message: errorMessage(error) };
  }
}

async function scanSession(session, priorDay) {
  const symbols = await getSymbols();
  const start = marketTime(session.date, "04:00");
  const end = new Date(marketTime(session.date, AFTER_HOURS_END).getTime() - 1);
  const priorStart = marketTime(priorDay, "00:00");
  const priorEnd = new Date(marketTime(session.date, "00:00").getTime() - 1);
  const result = { premarket: { covered: 0, gappers: [], runners: [] },
    wholeDay: { covered: 0, gappers: [], runners: [] }, withBars: 0, universeSize: symbols.length, open: session.open };

  async function scanBatch(batch) {
    const daily = await fetchScanBars(batch, "1Day", priorStart, priorEnd, "sip", session.date);
    const priors = new Map();
    for (const [symbol, bars] of daily) {
      const close = bars.find((bar) => marketDayKey(new Date(bar.time * 1000)) === priorDay)?.close;
      if (close > 0) priors.set(symbol, close);
    }
    // Fetch the entire batch so coverage includes names without a prior-session close.
    const intraday = await fetchScanBars(batch, `${BAR_MINUTES}Min`, start, end, "sip", session.date);
    return summarizeMovers(priors, intraday, session);
  }

  for (let offset = 0; offset < symbols.length; offset += BATCH_SIZE * PARALLEL_BATCHES) {
    const group = [];
    for (let index = offset; index < Math.min(offset + BATCH_SIZE * PARALLEL_BATCHES, symbols.length); index += BATCH_SIZE) {
      group.push(scanBatch(symbols.slice(index, index + BATCH_SIZE)));
    }
    for (const part of await Promise.all(group)) {
      result.withBars += part.withBars;
      for (const key of ["premarket", "wholeDay"]) {
        result[key].covered += part[key].covered;
        result[key].gappers.push(...part[key].gappers);
        result[key].runners.push(...part[key].runners);
      }
    }
  }

  for (const key of ["premarket", "wholeDay"]) sortMoverLists(result[key]);
  return result;
}

async function read(requested, now = new Date()) {
  const { session, ...info } = await context(requested, now);
  const row = await prisma.marketMoverDay.findUnique({ where: { dayKey: info.day } });
  if (row?.metrics) return { ...info, state: "ready", data: row.metrics };
  if (!session) return info;
  if (row?.error) return { ...info, state: "failed", message: row.error, canRetry: !(row.claimUntil > now) };
  if (row?.claimUntil > now) return { ...info, state: "loading" };
  return { ...info, state: "new" };
}

async function runScan(day, session, previous, claimUntil) {
  const where = { dayKey: day, claimUntil };
  try {
    const metrics = await scanSession(session, previous);
    if (!metrics.wholeDay.covered) {
      await prisma.marketMoverDay.updateMany({ where, data: { error: NO_COVERAGE, claimUntil: new Date(Date.now() + 60_000) } });
    } else {
      await prisma.marketMoverDay.updateMany({ where, data: { metrics, collectedAt: new Date(), claimUntil: null } });
    }
  } catch (error) {
    await prisma.marketMoverDay.updateMany({ where, data: { error: errorMessage(error), claimUntil: new Date(Date.now() + 60_000) } });
  }
}

async function collect(day, now = new Date()) {
  const status = await read(day, now);
  if (status.state !== "new" && !(status.state === "failed" && status.canRetry)) return status;
  if (activeScan) return { ...status, state: "waiting" };
  if (!status.previous) return { ...status, state: "unavailable", message: "Alpaca has no preceding session for this date." };
  const { session } = await context(day, now);
  if (!session) return status;
  const claimUntil = new Date(Date.now() + 8 * 60_000);
  // Reserve the local worker before yielding, then claim this day across API replicas.
  activeScan = true;
  try {
    await prisma.marketMoverDay.createMany({ data: [{ dayKey: day }], skipDuplicates: true });
    const claimed = await prisma.marketMoverDay.updateMany({
      where: { dayKey: day, collectedAt: null, OR: [{ claimUntil: null }, { claimUntil: { lte: now } }] },
      data: { claimUntil, error: null }
    });
    if (!claimed.count) {
      activeScan = false;
      return read(day, now);
    }
    void runScan(day, session, status.previous, claimUntil).finally(() => { activeScan = false; })
      .catch((error) => console.error("Could not record market mover scan status", error.message));
    return { ...status, state: "loading" };
  } catch (error) {
    activeScan = false;
    throw error;
  }
}

module.exports = { read, collect };
