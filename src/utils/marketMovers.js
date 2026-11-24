const { parse } = require("csv-parse/sync");
const { z } = require("zod");

const SESSIONS = { premarket: "premarket", "whole-day": "wholeDay" };
const GAPPER_COLUMNS = [1, 2, 3];
const dateSchema = z.string().date();
const columns = ["date", "session", "runner_count", "source",
  ...GAPPER_COLUMNS.flatMap((index) => [`gapper_${index}`, `gap_${index}_percent`])];

function parseMoverArchive(text) {
  const rows = parse(text, {
    bom: true, trim: true, skip_empty_lines: true,
    columns(headers) {
      if (new Set(headers).size !== headers.length || columns.some((key) => !headers.includes(key))) {
        throw new Error(`CSV headers must include ${columns.join(", ")}.`);
      }
      return headers;
    }
  });
  if (!rows.length) throw new Error("The file contains no historical summaries.");
  const days = new Map();

  rows.forEach((row, index) => {
    const { date, session, runner_count: count, source } = row;
    const key = Object.hasOwn(SESSIONS, session) ? SESSIONS[session] : null;
    const fail = (reason) => { throw new Error(`Data row ${index + 1}: ${reason}`); };
    if (!dateSchema.safeParse(date).success || !key) fail("Use a YYYY-MM-DD date and a premarket or whole-day session.");
    if (!/^\d{1,6}$/.test(count) || !source || source.length > 120) {
      fail("Provide a nonnegative integer runner count and a data source.");
    }
    const gappers = GAPPER_COLUMNS.flatMap((column) => {
      const symbol = row[`gapper_${column}`].toUpperCase();
      const raw = row[`gap_${column}_percent`];
      if (!symbol && !raw) return [];
      const gap = Number(raw.replace(/%$/, ""));
      if (!raw || !Number.isFinite(gap) || gap <= 0 || (symbol && !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol))) {
        fail(`Gap ${column} needs a positive percentage and may include a valid ticker.`);
      }
      return [{ symbol: symbol || null, gap }];
    }).sort((a, b) => b.gap - a.gap);
    const named = gappers.filter(({ symbol }) => symbol).map(({ symbol }) => symbol);
    if (new Set(named).size !== named.length || gappers.filter(({ gap }) => gap > 50).length > Number(count)) {
      fail("Use each ticker once and include every gap above 50% in the runner count.");
    }

    const prior = days.get(date) ?? {};
    if (prior[key]) fail("This date and session already occur in the file.");
    prior[key] = { source, runnerCount: Number(count), gappers };
    days.set(date, prior);
  });
  return days;
}

function archiveSession(session) {
  if (!session || session.covered === 0) return null;
  const runnerCount = session.runnerCount ?? (Array.isArray(session.runners) ? session.runners.length : null);
  const gappers = Array.isArray(session.gappers) ? session.gappers.filter(({ gap }) => Number.isFinite(gap) && gap > 0)
    .sort((a, b) => b.gap - a.gap).slice(0, 3).map(({ symbol, gap }) => ({ symbol, gap })) : [];
  if (runnerCount === null && !gappers.length) return null;
  return { runnerCount, gappers, source: session.source ?? "Alpaca SIP" };
}

module.exports = { parseMoverArchive, archiveSession };
