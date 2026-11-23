function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (!sorted.length) return null;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizePremarket(symbols, minuteBars, dailyBars, cutoff, minDollarVolume) {
  let covered = 0;
  let totalDollarVolume = 0;
  const leaders = [];
  const symbolVolumes = {};

  for (const symbol of symbols) {
    const priorClose = dailyBars.get(symbol)?.at(-1)?.close;
    if (!(priorClose > 0)) continue;
    covered += 1;
    const bars = minuteBars.get(symbol) || [];
    const volume = bars.reduce((sum, bar) => sum + bar.volume, 0);
    const dollarVolume = bars.reduce((sum, bar) => sum + bar.volume * (bar.vwap ?? bar.close), 0);
    symbolVolumes[symbol] = volume;

    const latest = bars.at(-1);
    if (!latest || cutoff.getTime() - (latest.time + 60) * 1000 > 300_000 || dollarVolume < minDollarVolume) continue;
    totalDollarVolume += dollarVolume;
    const gain = (latest.close / priorClose - 1) * 100;
    if (gain <= 0) continue;
    const peakGain = (Math.max(...bars.map((bar) => bar.high)) / priorClose - 1) * 100;
    leaders.push({
      symbol,
      price: latest.close,
      gain,
      volume,
      dollarVolume,
      peakGain,
      retained: peakGain > 0 ? gain / peakGain * 100 : null
    });
  }

  leaders.sort((a, b) => b.gain - a.gain || a.symbol.localeCompare(b.symbol));
  const top = leaders.slice(0, 10);
  return {
    covered,
    universeSize: symbols.length,
    totalDollarVolume,
    counts: [10, 20, 50].map((threshold) => leaders.filter(({ gain }) => gain + 1e-9 >= threshold).length),
    medianTopFive: median(top.slice(0, 5).map(({ gain }) => gain)),
    medianRetained: median(top.slice(0, 5).flatMap(({ retained }) => retained === null ? [] : [retained])),
    top,
    symbolVolumes
  };
}

function hasCoverage(metrics) {
  return metrics.universeSize > 0 && metrics.covered / metrics.universeSize >= 0.8;
}

function percentile(value, baseline) {
  const below = baseline.filter((other) => other < value).length;
  const equal = baseline.filter((other) => other === value).length;
  return (below + equal / 2) / baseline.length;
}

function heatScore(metrics, baseline) {
  if (!hasCoverage(metrics) || baseline.length < 10) return null;
  const measures = [
    (row) => row.counts[0],
    (row) => row.medianTopFive ?? 0,
    (row) => row.totalDollarVolume
  ];
  return measures.reduce((total, get) => total + percentile(get(metrics), baseline.map(get)), 0) / measures.length * 100;
}

function classifyPremarket(metrics, previousMetrics) {
  const baseline = previousMetrics.filter(hasCoverage).slice(0, 60);
  const score = heatScore(metrics, baseline);
  const heat = score === null ? null : score >= 70 ? "Hot" : score <= 30 ? "Cold" : "Normal";
  const recentScores = [score, ...baseline.slice(0, 9).map((row) => heatScore(row, baseline.slice(9)))];
  let cycle = null;
  if (recentScores.length === 10 && recentScores.every((value) => value !== null)) {
    const change = median(recentScores.slice(0, 5)) - median(recentScores.slice(5));
    cycle = change >= 10 ? "Heating up" : change <= -10 ? "Cooling" : "Steady";
  }

  const top = metrics.top.map((leader) => {
    const volumes = baseline.flatMap((prior) =>
      Object.hasOwn(prior.symbolVolumes, leader.symbol) ? [prior.symbolVolumes[leader.symbol]] : []
    );
    const usualVolume = volumes.length >= 5 ? median(volumes) : null;
    return { ...leader, relativeVolume: usualVolume > 0 ? leader.volume / usualVolume : null };
  });
  return { score, heat, cycle, baselineSessions: baseline.length, top };
}

module.exports = { summarizePremarket, classifyPremarket };
