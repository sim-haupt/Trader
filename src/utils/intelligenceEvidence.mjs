import { getMarketDayKey, getMarketParts, average, normalizeAdvancedTrades, calculateTradingCostDrag, calculateDrawdown,
  calculateLosingStreaks, __advancedAnalyticsInternals } from "../../frontend/src/utils/advancedAnalytics.js";
import { makeRiskRecords, buildRiskAnalytics } from "../../frontend/src/utils/riskAnalytics.js";
import { getMarketSession } from "../../frontend/src/utils/marketSessions.js";
import { buildMarketAssociations } from "../../frontend/src/utils/performanceIntelligence.js";
import { simulateTrades } from "../../frontend/src/utils/tradeSimulation.js";

const { groupBy, summarizeGroup, getTimeOfDayBucket } = __advancedAnalyticsInternals;
const MIN_COHORT = 10;
const MIN_DAYS = 10;
const noValues = (value) => !Number.isFinite(value);
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const CATEGORIES = ["performance", "setup", "time", "market", "execution", "costs", "risk", "behavior", "simulation"];
export const WIDGETS = ["performance", "insights", "context", "simulation"];
export const REPORT_KINDS = ["daily", "weekly", "monthly", "strategy", "risk", "behavior", "execution", "trend"];
export const GOAL_METRICS = {
  outsideWindow: ["Entries outside target window", "%"],
  riskCompliance: ["Rule compliance on assessable entries", "%"],
  commissionDrag: ["Recorded cost drag", "%"],
  executionSpread: ["Average entry spread", "$/share"],
  executionConsistency: ["Entry efficiency variability", "pp"],
  impulsive: ["Impulsive trades among behavior-tagged trades", "%"],
  discipline: ["Discipline score", "%"],
  customRule: ["Selected rule adherence", "%"],
  netExpectancy: ["Net expectancy", "$/trade"]
};

const goalsByCategory = {
  time: "outsideWindow", costs: "commissionDrag", execution: "executionConsistency",
  risk: "riskCompliance", behavior: "discipline", performance: "netExpectancy"
};

export const ACTIONS = {
  sample: "Review the cited trades and check whether the pattern repeats in a later period.",
  setups: "Review examples from the strongest and weakest setups and compare their entry plans.",
  windows: "Review entries in both windows and test the pattern on a later set of sessions.",
  costs: "Reconcile costs against the broker statement and look for a change in fee or share mix.",
  exits: "Replay the cited exits alongside the original plans. Check whether the available quotes and fills support the comparison.",
  behavior: "Review the self-reported observations alongside the trade plan and track the same rule in the next period.",
  risk: "Review the flagged entries and confirm which original limits and risk values applied.",
  market: "Compare matched setups across later sessions before treating the market association as repeatable.",
  simulation: "Compare a second trade cap and inspect excluded trades and position overlap.",
  coverage: "Collect missing original risk, historical quotes, or trade observations before drawing a conclusion."
};

export function formatMetric(value, unit = "") {
  if (noValues(value)) return "Unavailable";
  if (unit.startsWith("$")) return money.format(value) + unit.slice(1);
  if (unit === "count") return String(value);
  if (unit === "coefficient") return value.toFixed(3);
  if (unit === "p value") return value < .001 ? "<0.001" : value.toFixed(3);
  return `${Number(value.toFixed(unit === "r" ? 2 : 1))}${unit === "r" ? " R" : unit === "%" || unit === "pp" ? unit : unit ? ` ${unit}` : ""}`;
}

function samples(rows, metric) {
  return Array.from(groupBy(rows, (row) => row.dayKey).values(), (day) => metric(day)).filter(Number.isFinite);
}

function deviation(values) {
  if (values.length < 2) return null;
  const mean = average(values);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

export function sessionSupport(a, b) {
  if (a.length < MIN_DAYS || b.length < MIN_DAYS) return { strong: false, a: a.length, b: b.length };
  const error = Math.sqrt(deviation(a) / a.length + deviation(b) / b.length);
  const diff = average(a) - average(b);
  return { strong: error > 0 && Math.abs(diff) >= 2.8 * error, a: a.length, b: b.length };
}

function references(rows, descending = false) {
  return [...rows].sort((a, b) => descending ? b.netPnl - a.netPnl : a.netPnl - b.netPnl)
    .slice(0, 3).map((item) => ({ id: item.id, symbol: item.symbol, day: item.dayKey }));
}

function cohortMetrics(label, rows) {
  const summary = summarizeGroup(label, rows);
  return {
    label, count: rows.length, days: summary.sessionCount, net: rows.length ? summary.totalNetPnl : null,
    gross: summary.totalGrossPnl, grossSamples: summary.grossSamples, averageR: summary.averageR,
    rSamples: rows.filter((row) => Number.isFinite(row.rMultiple)).length,
    expectancy: rows.length ? summary.expectancy : null, winRate: rows.length ? summary.winRate : null,
    cost: rows.length ? summary.totalCosts : null, hold: Number.isFinite(summary.averageHoldSeconds) ? summary.averageHoldSeconds / 60 : null,
    capture: summary.mfeCapture, spread: average(rows.map((row) => row.spreadPerShare)),
    entryEfficiency: summary.execution.entryEfficiency.value, exitEfficiency: summary.execution.exitEfficiency.value,
    trades: references(rows, (summary.totalNetPnl ?? 0) >= 0)
  };
}

export function filterNormalized(rows, filter = {}) {
  return rows.filter((row) => {
    const record = row.source.analysis?.behavior;
    const rules = [record?.setup, record?.entry, record?.exit, ...(record?.rules || []).map(({ result }) => result)];
    const compliance = rules.includes("violated") ? "violated" : rules.includes("followed") ? "followed" : null;
    return (!filter.setup || row.setup.toLowerCase() === filter.setup.toLowerCase())
      && (!filter.symbol || row.symbol.includes(filter.symbol.toUpperCase()))
      && (!filter.side || row.side === filter.side)
      && (!filter.tag || row.tags.some((tag) => tag.toLowerCase() === filter.tag.toLowerCase()))
      && (!filter.session || getMarketSession(row.minutesFromMidnight) === filter.session)
      && (!filter.market || filter.market === row.premarketHeat || filter.market === row.factors.marketDirection || filter.market === row.factors.regime)
      && (!filter.result || (filter.result === "win" ? row.netPnl > 0 : row.netPnl < 0))
      && (!filter.confidence || (filter.confidence === "high" ? record?.confidence >= 4 : record?.confidence > 0 && record.confidence <= 2))
      && (!filter.compliance || filter.compliance === compliance);
  });
}

export function compareCohorts(a, b, premarket = []) {
  const left = filterNormalized(normalizeAdvancedTrades(a.trades, { premarketSnapshots: premarket }), a.filter);
  const right = filterNormalized(normalizeAdvancedTrades(b.trades, { premarketSnapshots: premarket }), b.filter);
  const ids = new Set(left.map(({ id }) => id));
  return {
    a: cohortMetrics("A", left), b: cohortMetrics("B", right),
    overlap: right.filter(({ id }) => ids.has(id)).length,
    pairedGrossNet: [left, right].map((rows) => {
      const paired = rows.filter((row) => Number.isFinite(row.grossPnl));
      return { count: paired.length, gross: average(paired.map((row) => row.grossPnl)), net: average(paired.map((row) => row.netPnl)) };
    })
  };
}

function simulationSummary(trades, saved, requestedCap) {
  const what = saved?.whatIf || {};
  if (!requestedCap && (!saved || saved.mode === "path")) return null;
  const options = { size: Number(what.size) || 1, seed: Number(what.seed) || 42 };
  const keys = ["riskPerTrade", "dailyLoss", "dailyProfit", "maxTrades", "lossStreak", "commissionPerShare", "feePerShare",
    ...(saved?.mode === "assumed" ? ["winRate", "rewardRisk"] : [])];
  for (const key of keys) if (what[key] !== "" && what[key] != null && Number.isFinite(Number(what[key]))) options[key] = Number(what[key]);
  if (requestedCap) {
    for (const key of Object.keys(options)) delete options[key];
    options.size = 1;
    options.maxTrades = requestedCap;
  }
  const simulation = simulateTrades(makeRiskRecords(trades), options);
  if (!simulation.actual.count) return null;
  return {
    mode: simulation.mode, actual: simulation.actual.net, actualCount: simulation.actual.count,
    comparable: simulation.comparable.count ? simulation.comparable.net : null, comparableCount: simulation.comparable.count,
    hypothetical: simulation.simulated.count ? simulation.simulated.net : null, hypotheticalCount: simulation.simulated.count,
    maxTrades: options.maxTrades ?? null, drawdown: simulation.simulated.count ? simulation.simulated.drawdown : null
  };
}

export function buildEvidence({ trades, previousTrades, ranges, premarket = [], profile = {}, filter = {}, requestedCap }) {
  const rawCurrent = normalizeAdvancedTrades(trades, { premarketSnapshots: premarket });
  const rawPrior = normalizeAdvancedTrades(previousTrades, { premarketSnapshots: premarket });
  const current = filterNormalized(rawCurrent, filter);
  const previous = filterNormalized(rawPrior, filter);
  const filteredIds = new Set(current.map(({ id }) => id));
  const closeOnly = Boolean(filter.result || filter.confidence || filter.compliance || filter.market);
  const scoped = trades.filter((row) => filteredIds.has(row.id) ||
    !closeOnly && row.grossPnl == null && row.netPnl == null &&
    (!filter.setup || (row.strategy || "").toLowerCase() === filter.setup.toLowerCase()) &&
    (!filter.symbol || row.symbol === filter.symbol.toUpperCase()) &&
    (!filter.side || row.side === filter.side) &&
    (!filter.tag || String(row.tags || "").split(",").some((tag) => tag.trim().toLowerCase() === filter.tag.toLowerCase())) &&
    (!filter.session || getMarketSessionFromRecord(row) === filter.session));
  const risk = buildRiskAnalytics(makeRiskRecords(scoped), profile.limits, { groupIds: true });
  const summary = cohortMetrics("Selected period", current);
  const prior = cohortMetrics("Comparison period", previous);
  const costs = calculateTradingCostDrag(current);
  const rows = [];
  const add = (id, category, title, facts, options = {}) => {
    rows.push({ id, category, title, facts: facts.filter((fact) => Number.isFinite(fact.value)),
      type: options.type || "historical", assessment: options.assessment || "Descriptive",
      support: options.support || 0, score: options.score || 0, alert: options.alert || false,
      direction: options.direction || "", trades: options.trades || [], action: options.action || "sample",
      goalMetric: goalsByCategory[category] ?? null });
  };
  const fact = (label, value, unit, n) => ({ label, value, unit, n });
  add("overview", "performance", "Trading results for the selected period", [
    fact("Net P&L", summary.net, "$", summary.count), fact("Gross P&L", summary.gross, "$", summary.grossSamples),
    fact("Net expectancy", summary.expectancy, "$/trade", summary.count), fact("Win rate", summary.winRate, "%", summary.count),
    fact("Expectancy in original planned R", summary.averageR, "r", summary.rSamples)
  ], { trades: summary.trades, support: summary.count });

  function compare(id, category, title, a, b, unit, deltaMin, aRows, bRows, dayValue, action, scale = 1) {
    if (a == null || b == null) return;
    const support = sessionSupport(samples(aRows, dayValue), samples(bRows, dayValue));
    const delta = a - b;
    const amount = Math.abs(delta);
    add(id, category, title, [
      fact("Selected period", a, unit, aRows.length), fact("Comparison period", b, unit, bRows.length),
      fact("Change", delta, unit === "%" ? "pp" : unit, null),
      fact("Selected sessions with inputs", support.a, "count", null),
      fact("Comparison sessions with inputs", support.b, "count", null)
    ], {
      assessment: support.strong ? "Session-level change signal" : "Descriptive comparison",
      support: Math.min(support.a, support.b),
      score: 10 + Math.min(30, Math.log2(1 + amount / scale) * 5) + (support.strong ? 30 : 0),
      direction: delta < 0 ? "lower" : "higher", alert: support.strong && amount >= deltaMin,
      trades: references(aRows, delta >= 0), action
    });
  }

  compare("net-change", "performance", "Net profitability change", summary.net, prior.net, "$", 25, current, previous,
    (day) => day.reduce((sum, row) => sum + row.netPnl, 0), "sample", 20);
  compare("expectancy-change", "performance", "Net expectancy change", summary.expectancy, prior.expectancy, "$/trade", 2, current, previous,
    (day) => average(day.map((row) => row.netPnl)), "sample");
  compare("win-change", "performance", "Win rate change", summary.winRate, prior.winRate, "%", 4, current, previous,
    (day) => average(day.map((row) => row.netPnl > 0 ? 100 : 0)), "sample", 5);
  compare("hold-change", "execution", "Holding duration change", summary.hold, prior.hold, "min", 1,
    current.filter((row) => Number.isFinite(row.holdSeconds)), previous.filter((row) => Number.isFinite(row.holdSeconds)),
    (day) => average(day.map((row) => row.holdSeconds / 60)), "exits");
  const c = (rows) => average(rows.map((row) => Number.isFinite(Number(row.source.commissions)) ? Number(row.source.commissions) : null));
  compare("commission-change", "costs", "Commission per trade change", c(current), c(previous), "$/trade", 0.1, current, previous, c, "costs", 0.1);
  for (const field of ["entryEfficiency", "exitEfficiency"]) {
    const recent = current.filter((row) => Number.isFinite(row.executionFacts[field]));
    const baseline = previous.filter((row) => Number.isFinite(row.executionFacts[field]));
    compare(field, "execution", field === "entryEfficiency" ? "Entry efficiency change" : "Exit efficiency change",
      summary[field], prior[field], "%", 5, recent, baseline, (day) => average(day.map((row) => row.executionFacts[field])), "exits");
  }

  function rankCohorts(category, getKey, action, label) {
    const baseline = groupBy(previous, getKey);
    const groups = Array.from(groupBy(current, getKey), ([key, values]) => ({ key, values, report: cohortMetrics(String(key), values) }));
    const eligible = groups.filter(({ report }) => report.count >= MIN_COHORT && report.days >= 3);
    const byNet = [...eligible].sort((a, b) => b.report.net - a.report.net);
    const byExpectancy = [...eligible].sort((a, b) => b.report.expectancy - a.report.expectancy);
    const best = (category === "setup" ? byNet : byExpectancy)[0]
      || [...groups].sort((a, b) => category === "setup" ? b.report.net - a.report.net : b.report.expectancy - a.report.expectancy)[0];
    const weakest = byExpectancy.at(-1) || [...groups].sort((a, b) => a.report.expectancy - b.report.expectancy)[0];
    if (best) add(`${category}-best`, category, `Strongest ${label} · ${best.key}`, [
      fact("Net P&L", best.report.net, "$", best.report.count), fact("Net expectancy", best.report.expectancy, "$/trade", best.report.count),
      fact("Sessions", best.report.days, "count", null)
    ], { support: best.report.count, assessment: eligible.length ? "Descriptive" : "Small sample. Treat the ranking as exploratory.", trades: references(best.values, true), action });
    if (weakest && weakest.key !== best?.key) add(`${category}-weak`, category, `Weakest ${label} by expectancy · ${weakest.key}`, [
      fact("Net expectancy", weakest.report.expectancy, "$/trade", weakest.report.count), fact("Net P&L", weakest.report.net, "$", weakest.report.count),
      fact("Sessions", weakest.report.days, "count", null)
    ], { support: weakest.report.count, assessment: eligible.length ? "Descriptive" : "Small sample. Treat the ranking as exploratory.", trades: references(weakest.values), action });
    const withBaseline = eligible.filter(({ key }) => (baseline.get(key)?.length || 0) >= MIN_COHORT)
      .map((row) => ({ ...row, old: baseline.get(row.key), prior: cohortMetrics(String(row.key), baseline.get(row.key)) }))
      .sort((a, b) => (a.report.expectancy - a.prior.expectancy) - (b.report.expectancy - b.prior.expectancy));
    const decline = withBaseline[0];
    if (decline && decline.report.expectancy < decline.prior.expectancy) compare(`${category}-decline-${decline.key}`, category,
      `Largest qualifying ${label} decline · ${decline.key}`, decline.report.expectancy, decline.prior.expectancy, "$/trade", 2,
      decline.values, decline.old, (day) => average(day.map((row) => row.netPnl)), action);
    return groups.sort((a, b) => b.report.count - a.report.count || b.report.net - a.report.net).slice(0, 12).map(({ report }) => report);
  }

  const setups = rankCohorts("setup", (row) => row.setup, "setups", "setup");
  const windows = rankCohorts("time", getTimeOfDayBucket, "windows", "entry window");
  add("recorded-costs", "costs", "Recorded commissions and fees", [
    fact("Trading costs", summary.cost, "$", summary.count), fact("Commission per trade", c(current), "$/trade", summary.count),
    fact("Cost drag", costs.costDragPercent, "%", summary.count), fact("Gross-to-net effect per paired trade", costs.expectancyDifference, "$/trade", summary.grossSamples)
  ], { support: summary.count, action: "costs" });
  const winners = current.filter((row) => row.netPnl > 0 && row.mfe > 0);
  if (winners.length) add("capture", "execution", "Profit captured on covered winners", [
    fact("Mean net P&L divided by gross favorable excursion", summary.capture, "%", winners.length),
    fact("Mean exit efficiency", summary.exitEfficiency, "%", current.filter((row) => Number.isFinite(row.executionFacts.exitEfficiency)).length)
  ], { support: winners.length, trades: [...winners].sort((a, b) => a.netPnl / a.mfe - b.netPnl / b.mfe).slice(0, 3)
    .map((row) => ({ id: row.id, symbol: row.symbol, day: row.dayKey })), action: "exits",
    assessment: "Descriptive. Later prices and hindsight do not establish that the exit was premature." });
  else if (Number.isFinite(summary.entryEfficiency) || Number.isFinite(summary.exitEfficiency) || Number.isFinite(summary.spread)) {
    add("execution-levels", "execution", "Covered execution measurements", [
      fact("Mean entry efficiency", summary.entryEfficiency, "%", current.filter((row) => Number.isFinite(row.executionFacts.entryEfficiency)).length),
      fact("Mean exit efficiency", summary.exitEfficiency, "%", current.filter((row) => Number.isFinite(row.executionFacts.exitEfficiency)).length),
      fact("Mean pre-fill spread", summary.spread, "$/share", current.filter((row) => Number.isFinite(row.spreadPerShare)).length)
    ], { action: "exits", trades: references(current.filter((row) => Number.isFinite(row.spreadPerShare))) });
  }

  const sequence = (rows) => calculateLosingStreaks([...rows].sort((a, b) => a.exitDate - b.exitDate));
  const lossRun = sequence(current);
  const priorRun = sequence(previous);
  if (current.length) add("loss-streak", "risk", "Losing streaks in realized trade order", [
    fact("Current longest loss streak", lossRun.longestLosingStreak, "count", current.length),
    fact("Prior longest loss streak", previous.length ? priorRun.longestLosingStreak : null, "count", previous.length)
  ], { assessment: "Descriptive against the previous period", support: current.length,
    alert: current.length >= 20 && previous.length >= 20 && lossRun.longestLosingStreak >= priorRun.longestLosingStreak + 2,
    score: 18 + lossRun.longestLosingStreak, direction: "higher", action: "risk" });
  const afterLoss = risk.underRules.find((row) => row.label === "After 2+ losses");
  if (afterLoss?.closed) {
    const ids = new Set(afterLoss.ids);
    const matches = current.filter((row) => ids.has(row.id));
    const baseline = current.filter((row) => !ids.has(row.id) && row.actualExit);
    add("after-losses", "behavior", "Performance after consecutive daily losses", [
      fact("Net expectancy after consecutive losses", afterLoss.expectancy, "$/trade", afterLoss.closed),
      fact("Expectancy of other dated trades", average(baseline.map((row) => row.netPnl)), "$/trade", baseline.length),
      fact("Win rate after consecutive losses", afterLoss.winRate, "%", afterLoss.closed),
      fact("Sessions in the loss-streak cohort", afterLoss.days, "count", null)
    ], { support: afterLoss.closed, action: "behavior", trades: references(matches),
      assessment: "Descriptive comparison. Setup mix and market conditions may differ." });
  }
  const flagged = scoped.filter((row) => risk.violations.get(row.id)?.length);
  if (flagged.length) add("risk-flags", "risk", "Entries flagged by current journal limits", [
    fact("Flagged entries", flagged.length, "count", scoped.length), fact("Known initial risk", risk.riskCoverage, "count", scoped.length)
  ], { support: flagged.length, score: 45 + Math.min(20, flagged.length), alert: true, direction: "breach", action: "risk",
    trades: flagged.slice(-3).map((row) => ({ id: row.id, symbol: row.symbol, day: getMarketDayKey(new Date(row.executions?.[0]?.occurredAt || row.entryDate)) })) });
  if (risk.checks) add("discipline", "behavior", "Follow-through on assessed rules", [
    fact("Discipline score", risk.disciplineScore, "%", risk.checks), fact("Trades assessed", risk.observed, "count", scoped.length)
  ], { support: risk.observed, action: "behavior" });
  const ruleViolations = filterNormalized(current, { compliance: "violated" });
  const ruleCompliance = filterNormalized(current, { compliance: "followed" });
  if (ruleViolations.length) add("assessed-violations", "behavior", "Measured outcomes on trades with assessed rule violations", [
    fact("Realized net P&L with recorded violations", ruleViolations.reduce((sum, row) => sum + row.netPnl, 0), "$", ruleViolations.length),
    fact("Expectancy with recorded violations", average(ruleViolations.map((row) => row.netPnl)), "$/trade", ruleViolations.length),
    fact("Expectancy with all assessed rules followed", average(ruleCompliance.map((row) => row.netPnl)), "$/trade", ruleCompliance.length)
  ], { assessment: "Recorded results of the assessed groups. This does not estimate a causal cost or the result of an untraded alternative.",
    support: ruleViolations.length, trades: references(ruleViolations), action: "behavior" });
  const behavior = risk.behavior.filter((row) => row.closed >= MIN_COHORT && row.days >= 3)
    .sort((a, b) => a.expectancy - b.expectancy)[0];
  if (behavior) {
    const ids = new Set(behavior.ids);
    const matches = current.filter((row) => ids.has(row.id));
    const baseline = current.filter((row) => !ids.has(row.id) && row.source.analysis?.behavior && row.actualExit);
    const other = average(baseline.map((row) => row.netPnl));
    const matchedByDay = groupBy(matches, (row) => row.dayKey);
    const diffs = Array.from(groupBy(baseline, (row) => row.dayKey), ([day, rest]) => {
      const matched = matchedByDay.get(day);
      return matched?.length ? average(matched.map((row) => row.netPnl)) - average(rest.map((row) => row.netPnl)) : null;
    }).filter(Number.isFinite);
    const meanDiff = average(diffs);
    const error = diffs.length >= 12 ? Math.sqrt(deviation(diffs) / diffs.length) : null;
    const signal = Number.isFinite(error) && error > 0 && meanDiff < -2.8 * error && meanDiff < -2;
    add("behavior-pattern", "behavior", `Lowest observed behavior cohort · ${behavior.label}`, [
      fact("Cohort expectancy", behavior.expectancy, "$/trade", behavior.closed),
      fact("Other observed trades expectancy", other, "$/trade", baseline.length),
      fact("Realized net P&L in the cohort", behavior.pnl, "$", behavior.closed),
      fact("Mean same-day expectancy difference", meanDiff, "$/trade", diffs.length)
    ], { assessment: "Observational and exploratory. Self-reporting and overlapping groups can affect this comparison.",
      support: diffs.length || behavior.days, score: signal ? 38 : 15, alert: signal, direction: "lower",
      trades: references(matches), action: "behavior" });
  }

  const market = buildMarketAssociations(current, groupBy).filter((row) => row.correlation !== null)
    .sort((a, b) => a.adjustedP - b.adjustedP || Math.abs(b.correlation) - Math.abs(a.correlation)).slice(0, 4);
  for (const factor of market) add(`market-${factor.key}`, "market", `Market association · ${factor.label}`, [
    fact("Pearson correlation of session averages", factor.correlation, "coefficient", factor.sessions),
    fact("Holm-adjusted p value", factor.adjustedP, "p value", factor.sessions), fact("Covered trades", factor.count, "count", null)
  ], { assessment: "Observational association. A correlation does not establish causation.", support: factor.sessions,
    score: factor.adjustedP <= 0.05 ? 32 : 12, alert: factor.adjustedP <= 0.05 && Math.abs(factor.correlation) >= 0.35,
    direction: factor.correlation > 0 ? "positive" : "negative", action: "market",
    trades: references(current.filter((row) => Number.isFinite(row.factors[factor.key])), true) });
  const simulation = simulationSummary(scoped, profile.simulation, requestedCap);
  if (simulation) add("simulation", "simulation", "Historical what-if comparison", [
    fact("Actual P&L on eligible sample", simulation.comparable, "$", simulation.comparableCount),
    fact("Simulated net P&L", simulation.hypothetical, "$", simulation.hypotheticalCount),
    fact("Daily trade cap", simulation.maxTrades, "count", null)
  ], { type: "hypothetical", assessment: "Scenario replay with saved or explicitly selected assumptions.", action: "simulation" });
  return {
    ranges, summary, prior, setups, windows, market, simulation,
    risk: { coverage: risk.riskCoverage, flags: flagged.length, discipline: risk.disciplineScore, checks: risk.checks,
      drawdown: current.length ? calculateDrawdown(current).currentDrawdown : null, newRisk: risk.riskCoverage ?
        risk.daily.reduce((sum, day) => sum + day.dailyRisk, 0) : null },
    evidence: rows.filter((row) => row.facts.length),
    insights: rows.filter((row) => row.alert && row.facts.length).sort((a, b) => b.score - a.score || b.support - a.support)
  };
}

function getMarketSessionFromRecord(row) {
  const timestamp = new Date(row.executions?.[0]?.occurredAt || row.entryDate);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const parts = getMarketParts(timestamp);
  return getMarketSession(Number(parts.hour) * 60 + Number(parts.minute));
}

export function goalValue(trades, settings, metric, limits) {
  const records = makeRiskRecords(trades);
  const normalized = normalizeAdvancedTrades(trades);
  const risk = buildRiskAnalytics(records, limits);
  const percent = (count, n) => ({ value: n ? count / n * 100 : null, n });
  if (metric === "outsideWindow") {
    const covered = normalized.filter((item) => Number.isFinite(item.minutesFromMidnight));
    return percent(covered.filter((item) => item.minutesFromMidnight < settings.startMinute || item.minutesFromMidnight >= settings.endMinute).length, covered.length);
  }
  if (metric === "riskCompliance") {
    const checked = [...risk.exposureAssessment.values()].filter((value) => value !== null);
    return percent(checked.filter(Boolean).length, checked.length);
  }
  if (metric === "commissionDrag") return { value: calculateTradingCostDrag(normalized).costDragPercent, n: normalized.length };
  if (metric === "executionSpread") {
    const measured = normalized.map((item) => item.spreadPerShare).filter(Number.isFinite);
    return { value: average(measured), n: measured.length };
  }
  if (metric === "executionConsistency") {
    const measured = normalized.map((item) => item.executionFacts.entryEfficiency).filter(Number.isFinite);
    return { value: measured.length >= 2 ? Math.sqrt(deviation(measured)) : null, n: measured.length };
  }
  if (metric === "impulsive") {
    const checked = records.filter((record) => record.observation?.tags?.length);
    return percent(checked.filter((record) => record.observation.tags.some((tag) => tag.toLowerCase() === "impulsive")).length, checked.length);
  }
  if (metric === "discipline") return { value: risk.disciplineScore, n: risk.checks };
  if (metric === "customRule") {
    const checked = records.flatMap((row) => row.observation?.rules?.filter((item) =>
      item.id === settings.ruleId && ["followed", "violated"].includes(item.result)) || []);
    return percent(checked.filter((item) => item.result === "followed").length, checked.length);
  }
  return { value: average(normalized.map((row) => row.netPnl)), n: normalized.length };
}


export function monthlyTrend(trades, buckets, filter, premarket = []) {
  const byMonth = groupBy(filterNormalized(normalizeAdvancedTrades(trades, { premarketSnapshots: premarket }), filter), (row) => row.dayKey.slice(0, 7));
  return buckets.map(({ from, to }) => cohortMetrics(from.slice(0, 7),
    (byMonth.get(from.slice(0, 7)) || []).filter((row) => row.dayKey >= from && row.dayKey <= to)));
}
