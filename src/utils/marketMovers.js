const { marketTime } = require("./marketSession");

const TOP_GAPPERS = 10;
const BAR_MINUTES = 30;
const AFTER_HOURS_END = "20:00";

function gain(price, priorClose) {
  return ((price - priorClose) / priorClose) * 100;
}

function compareRank(metric) {
  return (left, right) => right[metric] - left[metric] || left.symbol.localeCompare(right.symbol);
}

function rankSession(rows) {
  const session = {
    covered: rows.length,
    gappers: rows.filter((row) => row.gap > 0),
    runners: rows.filter((row) => row.peakGain > 50 + 1e-9)
  };
  sortMoverLists(session);
  return session;
}

function sortMoverLists(session) {
  session.gappers = session.gappers.sort(compareRank("gap")).slice(0, TOP_GAPPERS);
  session.runners.sort(compareRank("peakGain"));
}

function summarizeMovers(priors, intraday, session) {
  const open = marketTime(session.date, session.open).getTime() / 1000;
  const regularEnd = marketTime(session.date, session.close).getTime() / 1000;
  const start = marketTime(session.date, "04:00").getTime() / 1000;
  const end = marketTime(session.date, AFTER_HOURS_END).getTime() / 1000;
  const premarket = [];
  const wholeDay = [];
  let withBars = 0;

  for (const [symbol, bars] of intraday) {
    const valid = bars.filter((bar) => bar.time >= start && bar.time + BAR_MINUTES * 60 <= end &&
      bar.open > 0 && bar.close > 0 && bar.high > 0).sort((a, b) => a.time - b.time);
    if (!valid.length) continue;
    withBars += 1;
    const priorClose = priors.get(symbol);
    if (!Number.isFinite(priorClose) || priorClose <= 0) continue;
    const before = valid.filter((bar) => bar.time + BAR_MINUTES * 60 <= open);
    const regularFirst = valid.find((bar) => bar.time >= open && bar.time < regularEnd);

    function summarize(covered, gapPrice) {
      const high = Math.max(...covered.map((bar) => bar.high));
      return { symbol, priorClose, gapPrice: gapPrice ?? null, gap: gapPrice == null ? null : gain(gapPrice, priorClose),
        high, peakGain: gain(high, priorClose) };
    }

    if (before.length) premarket.push(summarize(before, before.at(-1).close));
    wholeDay.push(summarize(valid, regularFirst?.open));
  }

  return { premarket: rankSession(premarket), wholeDay: rankSession(wholeDay), withBars };
}

module.exports = { summarizeMovers, sortMoverLists, BAR_MINUTES, AFTER_HOURS_END };
