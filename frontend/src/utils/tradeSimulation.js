import { getMarketDayKey } from "./advancedAnalytics.js";
import { chronologicalEvents, newDailyState, realize, thresholdReached } from "./riskAnalytics.js";

const MINUTE = 60_000;

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function touches(bar, direction, stop, target) {
  return {
    stopHit: stop !== null && (direction > 0 ? bar.low <= stop : bar.high >= stop),
    targetHit: target !== null && (direction > 0 ? bar.high >= target : bar.low <= target)
  };
}

// Replay only the observed holding window. Minute OHLC does not reveal intrabar ordering.
export function reconstructExit(path, direction, { stopPercent, targetPercent, holdMinutes }) {
  if (!path?.bars?.length) return { reason: path?.reason || "No historical bars." };
  const entry = new Date(path.entry).getTime();
  const exit = new Date(path.exit).getTime();
  if (!(entry < exit && path.entryPrice > 0 && path.shares > 0)) return { reason: "Invalid path." };
  const stop = stopPercent > 0 ? path.entryPrice * (1 - direction * stopPercent / 100) : null;
  const target = targetPercent > 0 ? path.entryPrice * (1 + direction * targetPercent / 100) : null;
  const deadline = holdMinutes > 0 ? entry + holdMinutes * MINUTE : Infinity;
  const boundary = Math.min(exit, deadline);
  const intervals = path.bars.filter((bar) => bar.time * 1000 < boundary && (bar.time * 1000 + MINUTE) > entry)
    .sort((a, b) => a.time - b.time);
  if (!intervals.length) return { reason: "No bars in the eligible holding window." };

  // Any missing covered minute could contain the result-changing touch.
  const firstRequired = Math.floor(entry / MINUTE) * MINUTE;
  let expected = firstRequired;
  for (const bar of intervals) {
    const start = bar.time * 1000;
    const end = start + MINUTE;
    if (start !== expected) return { reason: "Missing minutes in the required price path." };
    expected += MINUTE;
    const { stopHit, targetHit } = touches(bar, direction, stop, target);
    if (start < entry || end > boundary) {
      if (stopHit || targetHit) return { reason: "Possible barrier touch in a partial candle." };
      continue;
    }
    const stopAtOpen = stop !== null && (bar.open - stop) * direction <= 0;
    const targetAtOpen = target !== null && (bar.open - target) * direction >= 0;
    if (stopAtOpen) return { exit: end, price: bar.open, reason: null, trigger: "Stop through open" };
    if (targetAtOpen) return { exit: end, price: target, reason: null, trigger: "Target through open" };
    if (stopHit && targetHit) return { reason: "Stop and target touched in the same candle." };
    if (stopHit || targetHit) return { exit: end, price: stopHit ? stop : target, trigger: stopHit ? "Stop" : "Target" };
    if (deadline < exit && end === deadline) return { exit: end, price: bar.close, trigger: "Holding limit" };
    if (deadline < exit && end < deadline && end + MINUTE > deadline) {
      const finalBar = intervals.find((candidate) => candidate.time * 1000 === end);
      if (!finalBar || touches(finalBar, direction, stop, target).stopHit || touches(finalBar, direction, stop, target).targetHit) {
        return { reason: "Holding limit falls within an ambiguous or missing candle." };
      }
      return { exit: deadline, price: bar.close, trigger: "Holding limit · last completed close" };
    }
  }
  if (expected < boundary || deadline < exit) return { reason: "Price path ends before the required evaluation time." };
  return { exit, price: path.exitPrice, trigger: "Actual exit" };
}

function outcomeSeries(records) {
  const exits = records.filter((row) => row.exit !== null && Number.isFinite(row.net))
    .sort((a, b) => a.exit - b.exit);
  let net = 0;
  let peak = 0;
  let drawdown = 0;
  const firstEntry = exits.reduce((oldest, row) => Math.min(oldest, row.entry), Infinity);
  const points = [{ n: 0, equity: 0, time: Number.isFinite(firstEntry) ? firstEntry : null }];
  exits.forEach((row, index) => {
    net += row.net;
    peak = Math.max(peak, net);
    drawdown = Math.max(drawdown, peak - net);
    points.push({ n: index + 1, equity: net, time: row.exit });
  });
  return { net, drawdown, count: exits.length, points };
}

export function simulateTrades(records, options, paths = new Map()) {
  const pathMode = options.stopPercent > 0 || options.targetPercent > 0 || options.holdMinutes > 0;
  const assumed = options.winRate != null || options.rewardRisk != null;
  const random = seededRandom(options.seed ?? 42);
  const actual = records.filter((record) => record.exit !== null && Number.isFinite(record.net));
  const riskSample = actual.filter((row) => row.planned > 0 && row.net !== 0);
  const winRate = options.winRate != null ? options.winRate / 100 :
    riskSample.length ? riskSample.filter((row) => row.net > 0).length / riskSample.length : null;
  const positiveRs = riskSample.filter((row) => row.net > 0).map((row) => row.net / row.planned);
  const rewardRisk = options.rewardRisk ?? (positiveRs.length ? positiveRs.reduce((sum, r) => sum + r, 0) / positiveRs.length : null);
  const eligible = [];
  const exclusions = new Map();

  for (const row of actual) {
    const exclude = (reason) => exclusions.set(reason, (exclusions.get(reason) || 0) + 1);
    const factor = options.riskPerTrade > 0 ? options.riskPerTrade / row.planned : options.size ?? 1;
    if (!Number.isFinite(factor) || !(factor > 0)) { exclude("Missing planned risk for fixed-risk sizing"); continue; }
    const overrideCosts = options.commissionPerShare != null || options.feePerShare != null;
    if (overrideCosts && row.quantity === null) { exclude("Missing share count for cost override"); continue; }
    if (assumed && (!(row.planned > 0) || winRate === null || rewardRisk === null)) {
      exclude("Missing planned risk or win/R assumptions"); continue;
    }
    let gross = row.gross;
    let exit = row.exit;
    let trigger = null;
    if (pathMode) {
      const path = paths.get(row.id);
      const reconstruction = reconstructExit(path, row.direction, options);
      if (reconstruction.reason) { exclude(reconstruction.reason); continue; }
      gross = (reconstruction.price - path.entryPrice) * row.direction * path.shares;
      exit = reconstruction.exit;
      trigger = reconstruction.trigger;
    }
    if (assumed) {
      if (pathMode) { exclude("Price-path and assumed-outcome scenarios are separate"); continue; }
      gross = (random() < winRate ? rewardRisk : -1) * row.planned;
    }
    if (gross === null && overrideCosts) { exclude("Recorded gross P&L required for cost override"); continue; }

    const recordedCommission = Number(row.trade.commissions || 0);
    const recordedFees = Number(row.trade.fees || 0);
    const commission = options.commissionPerShare != null ? options.commissionPerShare * row.quantity : recordedCommission;
    const fees = options.feePerShare != null ? options.feePerShare * row.quantity : recordedFees;
    // Keep broker-net results intact in the no-change baseline. Reprice when a different basis is explicitly selected.
    const rawNet = pathMode || assumed || overrideCosts ? gross - commission - fees : row.net;
    eligible.push({ ...row, net: rawNet * factor, exit, trigger, actual: row });
  }

  const selected = new Set();
  const days = new Map();
  const skipped = new Map();
  for (const { time, type, record } of chronologicalEvents(eligible)) {
    const day = type === "entry" ? record.day : getMarketDayKey(time);
    const state = days.get(day) ?? { ...newDailyState(), high: 0, halted: false };
    days.set(day, state);
    if (type === "exit") {
      if (selected.has(record.id)) {
        realize(state, record.net);
        state.high = Math.max(state.high, state.pnl);
        const hit = thresholdReached(state, options);
        state.halted ||= hit.loss || hit.profit || hit.streak;
      }
    } else {
      const reason = state.halted ? "Session stopped by a realized threshold" :
        options.maxTrades > 0 && state.entries >= options.maxTrades ? "Daily trade cap" : null;
      if (reason) skipped.set(reason, (skipped.get(reason) || 0) + 1);
      else {
        selected.add(record.id);
        state.entries += 1;
      }
    }
  }

  const simulatedTrades = eligible.filter((row) => selected.has(row.id));
  return {
    mode: pathMode ? "Price-path reconstruction" : assumed ? "Assumed outcomes" : "P&L rescaling",
    actual: outcomeSeries(actual), comparable: outcomeSeries(eligible.map((row) => row.actual)),
    simulated: outcomeSeries(simulatedTrades), simulatedTrades,
    exclusions: [...exclusions], skipped: [...skipped], uncovered: records.length - actual.length
  };
}

export function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

function wilson(hits, n) {
  const z = 1.959963984540054;
  const p = hits / n;
  const middle = (p + z * z / (2 * n)) / (1 + z * z / n);
  const spread = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n);
  return [Math.max(0, middle - spread), Math.min(1, middle + spread)];
}

export function monteCarlo(records, { trials, sessions, capital, ruinFloor, drawdownThreshold, size = 1, seed = 42 }) {
  const blocks = new Map();
  for (const record of records.filter((row) => row.exit !== null && Number.isFinite(row.net)).sort((a, b) => a.exit - b.exit)) {
    const day = record.exitDay ?? getMarketDayKey(record.exit);
    if (!blocks.has(day)) blocks.set(day, []);
    blocks.get(day).push(record.net * size);
  }
  const sample = [...blocks.values()];
  if (!sample.length || !(trials > 0 && sessions > 0 && capital > 0)) return null;

  const random = seededRandom(seed);
  const outcomes = [];
  const losingStreaks = [];
  const draws = [];
  const fan = Array.from({ length: sessions }, () => []);
  let ruinCount = 0;
  let drawdownCount = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    let equity = capital;
    let peak = capital;
    let drawdown = 0;
    let losing = 0;
    let maxLosing = 0;
    let ruined = capital <= ruinFloor;
    for (let day = 0; day < sessions; day += 1) {
      const block = sample[Math.floor(random() * sample.length)];
      for (const pnl of block) {
        equity += pnl;
        peak = Math.max(peak, equity);
        drawdown = Math.max(drawdown, peak - equity);
        ruined ||= equity <= ruinFloor;
        losing = pnl < 0 ? losing + 1 : 0;
        maxLosing = Math.max(maxLosing, losing);
      }
      fan[day].push(equity);
    }
    if (ruined) ruinCount += 1;
    if (drawdown >= drawdownThreshold) drawdownCount += 1;
    outcomes.push((equity - capital) / capital * 100);
    losingStreaks.push(maxLosing);
    draws.push(drawdown);
  }
  const sort = (values) => values.sort((a, b) => a - b);
  const band = (values) => [0.05, 0.5, 0.95].map((p) => quantile(sort(values), p));
  return {
    sourceDays: sample.length, trials, returns: band(outcomes), losingStreaks: band(losingStreaks), drawdowns: band(draws),
    ruin: ruinCount / trials, ruinCI: wilson(ruinCount, trials),
    drawdownChance: drawdownCount / trials, drawdownCI: wilson(drawdownCount, trials),
    distributions: { returns: outcomes, drawdown: draws, losing: losingStreaks },
    fan: [{ session: 0, range: [capital, capital], median: capital }, ...fan.map((values, index) => {
      const [low, median, high] = band(values);
      return { session: index + 1, range: [low, high], median };
    })]
  };
}
