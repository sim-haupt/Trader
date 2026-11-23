import { calculateDrawdown, getMarketDayKey, getMarketParts, getPeriodKey, normalizeAdvancedTrades } from "./advancedAnalytics.js";
import { getMarketSession } from "./marketSessions.js";

export const RISK_LIMITS = [
  ["dailyLoss", "Daily realized loss ($)"],
  ["dailyProfit", "Daily realized profit target ($)"],
  ["dailyExposure", "New daily risk ($)"],
  ["weeklyExposure", "New weekly risk ($)"],
  ["tradeRisk", "Initial risk per trade ($)"],
  ["lossStreak", "Consecutive daily losses"]
];

export const BEHAVIOR_TAGS = ["Impulsive", "Revenge trading", "FOMO", "Overtrading"];
export const RULE_FIELDS = [["setup", "Setup compliance"], ["entry", "Entry discipline"], ["exit", "Exit discipline"]];
export const number = (value) => value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

function positive(value) {
  const parsed = number(value);
  return parsed > 0 ? parsed : null;
}

function timestamp(value) {
  if (value == null) return null;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

export function summarizeDiscipline(observation) {
  if (!observation) return { checked: 0, followed: 0, violated: 0, score: null };
  const assessments = [
    ...RULE_FIELDS.map(([key]) => observation[key]),
    ...new Map((observation.rules || []).map(({ id, result }) => [id, result])).values()
  ];
  const followed = assessments.filter((value) => value === "followed").length;
  const violated = assessments.filter((value) => value === "violated").length;
  const checked = followed + violated;
  return { checked, followed, violated, score: checked ? followed / checked * 100 : null };
}

export function makeRiskRecords(trades) {
  const performance = new Map(normalizeAdvancedTrades(trades).map((item) => [item.id, item]));
  return trades.flatMap((trade) => {
    const first = trade.executions?.find((execution) => execution.source === "IMPORTED");
    const entry = timestamp(first?.occurredAt ?? trade.entryDate);
    if (entry === null) return [];
    const actualExit = timestamp(trade.exitDate);
    const exit = actualExit !== null && actualExit >= entry ? Math.max(actualExit, entry + 1) : null;
    const planned = positive(trade.entryReview?.plannedInitialRisk ?? trade.plannedInitialRisk);
    const stop = positive(trade.entryReview?.plannedStop);
    const direction = trade.side === "SHORT" ? -1 : 1;
    const firstPrice = positive(first?.price);
    const distance = stop && firstPrice ? (firstPrice - stop) * direction : null;
    const actualShares = positive(first?.quantity);
    const initial = distance > 0 && actualShares ? distance * actualShares : null;
    const { hour, minute } = getMarketParts(entry);
    const observation = trade.analysis?.behavior;
    return [{
      id: trade.id, trade, entry, exit, day: getMarketDayKey(entry), exitDay: exit !== null ? getMarketDayKey(actualExit) : null,
      week: getPeriodKey(new Date(entry), "weekly"), session: getMarketSession(Number(hour) * 60 + Number(minute)),
      ticker: trade.symbol || "Unknown", setup: trade.setup || trade.strategy || "Unclassified", direction,
      planned, initial, risk: planned ?? initial, quantity: positive(trade.quantity), observation,
      discipline: summarizeDiscipline(observation), net: performance.get(trade.id)?.netPnl ?? null,
      gross: performance.get(trade.id)?.grossPnl ?? null, mae: performance.get(trade.id)?.mae ?? null,
      hold: performance.get(trade.id)?.holdSeconds ?? null
    }];
  }).sort((a, b) => a.entry - b.entry || String(a.id).localeCompare(String(b.id)));
}

export function chronologicalEvents(records) {
  return records.flatMap((record) => [
    { time: record.entry, type: "entry", record },
    ...(record.exit !== null ? [{ time: record.exit, type: "exit", record }] : [])
  ]).sort((a, b) => a.time - b.time || Number(a.type === "entry") - Number(b.type === "entry"));
}

export function newDailyState() {
  return { pnl: 0, low: 0, losses: 0, wins: 0, entries: 0, dailyRisk: 0, missingRisk: 0, observedCloses: 0 };
}

export function realize(state, pnl) {
  state.pnl += pnl;
  state.low = Math.min(state.low, state.pnl);
  state.losses = pnl < 0 ? state.losses + 1 : 0;
  state.wins = pnl > 0 ? state.wins + 1 : 0;
  state.observedCloses += 1;
}

export function thresholdReached(state, limits) {
  return {
    loss: limits.dailyLoss > 0 && state.low <= -limits.dailyLoss,
    profit: limits.dailyProfit > 0 && (state.high ?? 0) >= limits.dailyProfit,
    streak: limits.lossStreak > 0 && state.losses >= limits.lossStreak
  };
}

export function summarizeRiskRows(rows, daysById) {
  const closed = rows.filter((row) => row.exit !== null && Number.isFinite(row.net));
  const rs = closed.filter((row) => row.planned > 0).map((row) => row.net / row.planned);
  const holds = closed.map((row) => row.hold).filter(Number.isFinite);
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const days = new Set(rows.map((row) => row.day)).size;
  return {
    count: rows.length, closed: closed.length, days,
    frequency: days ? rows.length / days : null,
    winRate: mean(closed.map((row) => row.net > 0 ? 100 : 0)),
    pnl: closed.length ? closed.reduce((sum, row) => sum + row.net, 0) : null,
    expectancy: mean(closed.map((row) => row.net)),
    averageR: mean(rs), rCount: rs.length,
    holdingSeconds: mean(holds),
    riskViolations: rows.filter((row) => (daysById.get(row.id)?.length || 0) > 0).length
  };
}

function coefficientOfVariation(values) {
  if (values.length < 2) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!(average > 0)) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) / average;
}

function group(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    for (const value of new Set([key(row)].flat().filter(Boolean))) {
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(row);
    }
  }
  return groups;
}

export function buildRiskAnalytics(records, limits = {}, { groupIds = false } = {}) {
  const daily = new Map();
  const weekly = new Map();
  const violations = new Map();
  const counterfactualLabels = new Map();
  const exposureAssessment = new Map();
  let longestLosses = 0;
  let activeRisk = 0;

  for (const { type, time, record } of chronologicalEvents(records)) {
    const day = type === "entry" ? record.day : getMarketDayKey(time);
    const state = daily.get(day) ?? { day, ...newDailyState(), high: 0, peakRisk: activeRisk };
    daily.set(day, state);

    if (type === "exit") {
      if (record.net !== null) {
        realize(state, record.net);
        state.high = Math.max(state.high, state.pnl);
        longestLosses = Math.max(longestLosses, state.losses);
      }
      activeRisk = Math.max(0, activeRisk - (record.risk ?? 0));
      continue;
    }

    const week = weekly.get(record.week) ?? { week: record.week, risk: 0, missing: 0, entries: 0 };
    weekly.set(record.week, week);
    const reached = thresholdReached(state, limits);
    const flags = [];
    if (reached.loss) flags.push("After daily loss limit");
    if (reached.profit) flags.push("After daily profit target");
    if (reached.streak) flags.push("After loss streak limit");
    counterfactualLabels.set(record.id, [
      ...(state.wins ? [state.wins >= 2 ? "After 2+ wins" : "After 1 win"] : []),
      ...(state.losses ? [state.losses >= 2 ? "After 2+ losses" : "After 1 loss"] : []),
      ...flags
    ]);
    state.entries += 1;
    week.entries += 1;

    if (record.risk === null) {
      state.missingRisk += 1;
      week.missing += 1;
    } else {
      state.dailyRisk += record.risk;
      week.risk += record.risk;
      activeRisk += record.risk;
      state.peakRisk = Math.max(state.peakRisk, activeRisk);
      if (limits.tradeRisk > 0 && record.risk > limits.tradeRisk) flags.push("Initial risk per trade");
      if (limits.dailyExposure > 0 && state.dailyRisk > limits.dailyExposure) flags.push("Daily risk exposure");
      if (limits.weeklyExposure > 0 && week.risk > limits.weeklyExposure) flags.push("Weekly risk exposure");
    }
    const exposureFlags = flags.some((flag) => ["Initial risk per trade", "Daily risk exposure", "Weekly risk exposure"].includes(flag));
    const exposureConfigured = limits.tradeRisk > 0 || limits.dailyExposure > 0 || limits.weeklyExposure > 0;
    const covered = record.risk !== null && !(limits.dailyExposure > 0 && state.missingRisk) &&
      !(limits.weeklyExposure > 0 && week.missing);
    exposureAssessment.set(record.id, !exposureConfigured ? null : exposureFlags ? false : covered ? true : null);
    violations.set(record.id, flags);
  }

  const groups = (key) => Array.from(group(records, key), ([label, rows]) => ({
    label, ...summarizeRiskRows(rows, violations),
    committed: rows.reduce((sum, row) => sum + (row.risk ?? 0), 0),
    covered: rows.filter((row) => row.risk !== null).length,
    ...(groupIds ? { ids: rows.map((row) => row.id) } : {})
  }));
  const observed = records.filter((row) => row.discipline.checked);
  const checks = observed.reduce((sum, row) => sum + row.discipline.checked, 0);
  const follows = observed.reduce((sum, row) => sum + row.discipline.followed, 0);
  const sized = records.map((row) => row.risk).filter(Number.isFinite);
  const averageRisk = sized.length ? sized.reduce((sum, value) => sum + value, 0) / sized.length : null;
  const riskCV = coefficientOfVariation(sized);
  const shareCV = coefficientOfVariation(records.map((row) => row.quantity).filter(Number.isFinite));

  const drawdown = calculateDrawdown(records.filter((row) => row.exit !== null && Number.isFinite(row.net))
    .map((row, sourceIndex) => ({
      entryDate: new Date(row.entry), exitDate: new Date(row.exit), netPnl: row.net,
      rMultiple: row.planned > 0 ? row.net / row.planned : null, sourceIndex
    })));

  return {
    daily: [...daily.values()], weekly: [...weekly.values()], violations, exposureAssessment, longestLosses, averageRisk, riskCV, shareCV, drawdown, performance: summarizeRiskRows(records, violations),
    maxDailyLoss: [...daily.values()].some((row) => row.observedCloses) ? Math.max(0, ...[...daily.values()].map((row) => -row.low)) : null,
    riskCoverage: sized.length, plannedRiskRows: records.filter((row) => row.planned !== null || row.initial !== null),
    disciplineScore: checks ? follows / checks * 100 : null, checks, observed: observed.length,
    underRules: groups((row) => counterfactualLabels.get(row.id)),
    concentration: { Ticker: groups((row) => row.ticker), Setup: groups((row) => row.setup), Session: groups((row) => row.session) },
    behavior: groups((row) => {
      const item = row.observation;
      if (!item) return [];
      return [
        ...(item.before ? [`Before: ${item.before}`] : []), ...(item.after ? [`After: ${item.after}`] : []),
        ...(item.confidence ? [`Confidence ${item.confidence}/5`] : []), ...(item.quality ? [`Quality ${item.quality}/5`] : []),
        ...RULE_FIELDS.flatMap(([key, label]) => item[key] === "followed" || item[key] === "violated" ? [`${label}: ${item[key]}`] : []),
        ...(item.tags || []).map((tag) => `Tag: ${tag}`),
        ...(item.rules || []).filter(({ result }) => result !== "unknown").map(({ label, result }) => `${label}: ${result}`)
      ];
    })
  };
}
