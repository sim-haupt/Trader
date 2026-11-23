import { useEffect, useRef, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import analysisService from "../../services/analysisService";
import { buildHistogram } from "../../utils/advancedAnalytics";
import { formatCurrency } from "../../utils/formatters";
import { number } from "../../utils/riskAnalytics";
import { simulateTrades } from "../../utils/tradeSimulation";
import Card from "../ui/Card";
import { Table } from "./PerformanceIntelligence";

const green = "#34e0a1";
const blue = "#63b3ff";
const grey = "#a3a3a3";
const grid = "rgba(255,255,255,0.09)";
const tip = { background: "#131313", border: "1px solid #333", color: "white" };
const money = (value) => value == null ? "–" : formatCurrency(value);
const pct = (value) => value == null ? "–" : `${(value * 100).toFixed(1)}%`;
const dollars = (key) => `$${Number(key).toFixed(0)}`;
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const intradayClock = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const distributions = { returns: "Terminal return (%)", drawdown: "Maximum drawdown ($)", losing: "Longest losing streak (trades)" };

const commonFields = [
  ["size", "Position size multiplier", 0.01, 50, .01],
  ["riskPerTrade", "Fixed planned risk per trade ($)", .01, 1_000_000, .01],
  ["dailyLoss", "Daily loss stop ($)", .01, 1_000_000, .01],
  ["dailyProfit", "Daily profit stop ($)", .01, 1_000_000, .01],
  ["maxTrades", "Maximum entries per session", 1, 1000, 1],
  ["lossStreak", "Stop after consecutive losses", 1, 1000, 1],
  ["commissionPerShare", "Round-trip commission per share ($)", 0, 10, .0001],
  ["feePerShare", "Round-trip routing fee per share ($)", 0, 10, .0001]
];
const modeFields = {
  path: [["stopPercent", "Stop distance (%)", .01, 99.99, .01], ["targetPercent", "Target distance (%)", .01, 99.99, .01],
    ["holdMinutes", "Maximum holding minutes", 1, 2880, 1]],
  assumed: [["winRate", "Assumed win rate (%)", 0, 100, .1], ["rewardRisk", "Assumed reward per unit risk", .01, 100, .01],
    ["seed", "Random seed", 0, 2147483647, 1]],
  rescale: []
};
const mcFields = [
  ["capital", "Starting equity ($)", 1, 1_000_000_000, 1], ["ruinFloor", "Ruin equity floor ($)", 0, 1_000_000_000, 1],
  ["drawdownThreshold", "Drawdown threshold ($)", 1, 1_000_000_000, 1], ["sessions", "Projected sessions", 1, 120, 1],
  ["trials", "Simulation trials", 100, 5000, 100], ["size", "Scenario A size multiplier", .01, 50, .01],
  ["compareSize", "Scenario B size multiplier", .01, 50, .01], ["seed", "Random seed", 0, 2147483647, 1]
];
const whatDefaults = { size: "1", seed: "42" };
const mcDefaults = { capital: "10000", ruinFloor: "5000", drawdownThreshold: "1000", sessions: "30", trials: "1000", size: "1", compareSize: "0.5", seed: "42" };

function Inputs({ fields, values, onChange, required = false }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {fields.map(([key, label, min, max, step]) => (
        <label className="analysis-field" key={key}>{label}
          <input type="number" required={required} min={min} max={max} step={step}
            inputMode={step === 1 ? "numeric" : "decimal"} value={values[key] ?? ""}
            onChange={(event) => onChange((current) => ({ ...current, [key]: event.target.value }))} />
        </label>
      ))}
    </div>
  );
}

function alignEquity(result) {
  const events = new Map();
  for (const series of ["actual", "comparable", "simulated"]) {
    result[series].points.slice(1).forEach(({ time, equity }) => {
      events.set(time, { ...events.get(time), [series]: equity });
    });
  }
  const ordered = [...events].sort(([a], [b]) => a - b);
  const start = [result.actual, result.comparable, result.simulated].map((row) => row.points[0].time)
    .filter(Number.isFinite).reduce((minimum, time) => Math.min(minimum, time), Infinity);
  let values = { actual: 0, comparable: 0, simulated: 0 };
  return ordered.length ? [{ time: Math.min(start, ordered[0][0] - 1), ...values }, ...ordered.map(([time, changes]) => {
    values = { ...values, ...changes };
    return { time, ...values };
  })] : [];
}

function WhatIfResults({ result }) {
  const chart = alignEquity(result);
  const oneDate = chart.length > 1 && clock.format(chart[0].time) === clock.format(chart.at(-1).time);
  const tickClock = oneDate ? intradayClock : clock;
  const width = chart.length > 1 ? (chart.at(-1).time - chart[0].time) : 0;
  const ticks = width < 60_000 ? [chart.at(-1)?.time].filter(Number.isFinite) : undefined;
  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      <h3 className="font-semibold">Hypothetical · {result.mode}</h3>
      <Table caption="Actual and simulated performance" headings={["Series", "Closed trades", "Net P&L", "Max drawdown"]}
        rows={[["Actual filtered history", result.actual], ["Actual comparable subset", result.comparable], ["Hypothetical", result.simulated]]
          .map(([label, row]) => [label, row.count, row.count ? money(row.net) : "–", row.count ? money(row.drawdown) : "–"])} />
      <p className="text-sm text-mist">{result.uncovered} trades lack a dated realized result. {result.comparable.count - result.simulated.count} eligible entries were skipped by scenario rules.</p>
      {[...result.exclusions, ...result.skipped].length > 0 && <ul className="space-y-1 text-sm text-mist">
        {[...result.exclusions, ...result.skipped].map(([reason, count]) => <li key={reason}>{count} · {reason}</li>)}
      </ul>}
      {chart.length > 1 && <div className="h-64 min-w-0" aria-label="Historical and hypothetical equity">
        <ResponsiveContainer>
          <LineChart data={chart} margin={{ top: 5, right: 12, left: 2, bottom: 3 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="time" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => tickClock.format(value)} ticks={ticks} minTickGap={25} tick={{ fill: grey, fontSize: 11 }} />
            <YAxis tickFormatter={dollars} tick={{ fill: grey, fontSize: 11 }} />
            <Tooltip labelFormatter={(value) => `${clock.format(value)} ${intradayClock.format(value)} ET`} formatter={(value) => money(value)} contentStyle={tip} />
            <Line type="stepAfter" name="Actual comparable" dataKey="comparable" stroke={grey} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            {result.simulated.count > 0 && <Line type="stepAfter" name="Hypothetical" dataKey="simulated" stroke={blue} strokeWidth={2} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </div>
  );
}

function Probability({ value, interval }) {
  return <>{pct(value)} <span className="text-mist">({pct(interval[0])}–{pct(interval[1])})</span></>;
}

function MonteResults({ result }) {
  const [scenario, setScenario] = useState("A");
  const [distributionMetric, setDistributionMetric] = useState("returns");
  const row = (label, value) => [
    label, `${value.returns[0].toFixed(1)}% / ${value.returns[1].toFixed(1)}% / ${value.returns[2].toFixed(1)}%`,
    money(value.drawdowns[1]), <Probability value={value.drawdownChance} interval={value.drawdownCI} />,
    <Probability value={value.ruin} interval={value.ruinCI} />, value.losingStreaks.map((n) => n.toFixed(1)).join(" / ")
  ];
  const active = result[scenario];
  const samples = active.distributions[distributionMetric];
  const distribution = distributionMetric === "losing"
    ? [...samples.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map())]
      .map(([label, count]) => ({ label, count }))
    : buildHistogram(samples, 10);
  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      <h3 className="font-semibold">Statistical estimates · {result.label}</h3>
      <p className="text-sm text-mist">{result.A.trials.toLocaleString()} paths sampled from {result.A.sourceDays} realized sessions, with replacement. Probability parentheses show 95% Wilson intervals for simulation trials.</p>
      {result.A.sourceDays < 20 && <p className="text-sm text-[var(--danger,#ff5f7a)]">Fewer than 20 source sessions. Estimates are especially sensitive to the available history.</p>}
      <Table caption="Monte Carlo scenario comparison" headings={["Scenario", "Return P5 / P50 / P95", "Median max DD", "DD threshold chance", "Ruin floor chance", "Longest loss streak P5 / P50 / P95"]}
        rows={[row(`A · ${result.size}×`, result.A), row(`B · ${result.compareSize}×`, result.B)]} />
      <label className="analysis-field max-w-44">Chart scenario
        <select value={scenario} onChange={(event) => setScenario(event.target.value)}><option>A</option><option>B</option></select>
      </label>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 text-sm font-medium">Projected equity · P5–P95 and median</h4>
          <div className="h-60">
            <ResponsiveContainer>
              <ComposedChart data={active.fan}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="session" tick={{ fill: grey, fontSize: 11 }} />
                <YAxis tickFormatter={dollars} tick={{ fill: grey, fontSize: 11 }} />
                <Tooltip contentStyle={tip} labelFormatter={(value) => `Session ${value}`}
                  formatter={(value) => Array.isArray(value) ? value.map(money).join(" to ") : money(value)} />
                <Area dataKey="range" name="P5–P95" stroke="none" fill={blue} fillOpacity={0.2} isAnimationActive={false} />
                <Line dataKey="median" name="Median" stroke={blue} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0">
          <label className="analysis-field mb-2 max-w-xs">Distribution
            <select value={distributionMetric} onChange={(event) => setDistributionMetric(event.target.value)}>
              {Object.entries(distributions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={distribution}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: grey, fontSize: 10 }} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fill: grey, fontSize: 11 }} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="count" name="Paths" fill={green} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <p className="text-sm text-mist">Ruin means crossing the configured equity floor at any simulated close. Paths continue after a crossing so the displayed distribution captures all draws. Historical results do not guarantee future performance.</p>
    </div>
  );
}

export default function SimulationLab({ records, profile, onSaveProfile }) {
  const saved = profile.simulation;
  const [mode, setMode] = useState(saved?.mode ?? "rescale");
  const [what, setWhat] = useState({ ...whatDefaults, ...saved?.whatIf });
  const [mc, setMc] = useState({ ...mcDefaults, ...saved?.monte });
  const [source, setSource] = useState(saved?.source ?? "actual");
  const [whatResult, setWhatResult] = useState(null);
  const [mcResult, setMcResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [whatError, setWhatError] = useState("");
  const [mcError, setMcError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const monteWorker = useRef(null);

  useEffect(() => {
    setWhatResult(null);
    setMcResult(null);
    setBusy((current) => current === "monte" ? "" : current);
    return () => {
      monteWorker.current?.terminate();
      monteWorker.current = null;
    };
  }, [records]);

  const closed = records.filter((row) => row.exit !== null && Number.isFinite(row.net));
  async function runWhatIf(event) {
    event.preventDefault();
    setBusy("what");
    setWhatError("");
    const options = Object.fromEntries([...commonFields, ...modeFields[mode]].map(([key]) => [key, number(what[key])]));
    options.size ??= 1;
    try {
      const paths = new Map();
      if (mode === "path") {
        if (!(options.stopPercent > 0 || options.targetPercent > 0 || options.holdMinutes > 0)) throw new Error("Set a stop, target, or holding limit.");
        const ids = closed.slice(-30).map(({ id }) => id);
        for (let index = 0; index < ids.length; index += 10) {
          const batch = await analysisService.getSimulationPaths(ids.slice(index, index + 10));
          batch.forEach((path) => paths.set(path.id, path));
        }
        closed.slice(0, Math.max(0, closed.length - 30)).forEach(({ id }) => paths.set(id, { reason: "Outside the latest 30-trade path window" }));
      }
      if (mode === "assumed" && options.winRate == null && options.rewardRisk == null) throw new Error("Enter an assumed win rate or reward-to-risk ratio.");
      setWhatResult(simulateTrades(records, options, paths));
      setMcResult(null);
    } catch (error) {
      setWhatError(error.message);
    } finally {
      setBusy("");
    }
  }

  function runMonte(event) {
    event.preventDefault();
    setMcError("");
    const input = Object.fromEntries(mcFields.map(([key]) => [key, number(mc[key])]));
    if (input.ruinFloor >= input.capital) { setMcError("The ruin floor must be below starting equity."); return; }
    const sample = source === "scenario" ? whatResult?.simulatedTrades : records;
    if (!sample?.length) { setMcError("Run a what-if with eligible trades or choose actual results."); return; }
    setBusy("monte");
    setMcResult(null);
    const worker = new Worker(new URL("../../utils/simulation.worker.js", import.meta.url), { type: "module" });
    monteWorker.current = worker;
    function finish() {
      worker.terminate();
      monteWorker.current = null;
      setBusy("");
    }
    worker.onmessage = ({ data }) => {
      if (data.error || !data.A || !data.B) setMcError(data.error || "No dated realized sessions were available.");
      else setMcResult({ A: data.A, B: data.B, size: input.size, compareSize: input.compareSize,
        label: source === "scenario" ? "Hypothetical scenario sample" : "Historical session sample" });
      finish();
    };
    worker.onerror = () => {
      setMcError("The simulation worker could not complete the run.");
      finish();
    };
    worker.postMessage({
      sample: sample.map(({ net, exit, exitDay }) => ({ net, exit, exitDay })), options: input
    });
  }

  async function save() {
    setBusy("save");
    setSaveStatus("");
    try {
      onSaveProfile(await analysisService.saveSimulation({ mode, source, whatIf: what, monte: mc }));
      setSaveStatus("Simulation assumptions saved for this account.");
    } catch (error) {
      setSaveStatus(error.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="analysis-panel flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">{closed.length} closed trades with known timing and results in the current filter.</p>
        <button type="button" className="ui-button min-h-11 px-3" disabled={Boolean(busy)} onClick={save}>Save assumptions</button>
        {saveStatus && <p role="status" className="basis-full text-sm">{saveStatus}</p>}
      </div>
      <Card title="What-if trading" subtitle="Hypothetical outcomes compared with the same eligible historical trades.">
        <form className="space-y-4" onSubmit={runWhatIf}>
          <label className="analysis-field max-w-xs">Scenario method
            <select value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="rescale">Rescale recorded P&amp;L</option><option value="path">Reconstruct a historical price path</option>
              <option value="assumed">Assume win rate and reward-to-risk</option>
            </select>
          </label>
          <Inputs fields={commonFields} values={what} onChange={setWhat} />
          {modeFields[mode].length > 0 && <Inputs fields={modeFields[mode]} values={what} onChange={setWhat} />}
          <p className="text-sm text-mist">Fixed risk overrides the size multiplier and requires an original dollar plan. Blank cost fields use recorded costs. Daily rules affect later entries after a result has been realized.</p>
          {mode === "path" && <p className="text-sm text-mist">Uses the latest 30 filtered trades with at most 48 hours of observed holding. It tests only the original holding window. Missing, partial, or ambiguous candles can make a trade ineligible. Minute OHLC estimates do not model order execution.</p>}
          {mode === "assumed" && <p className="text-sm text-mist">An omitted assumption uses the corresponding statistic from covered recorded trades. Simulated wins and losses use a seeded draw.</p>}
          <button className="ui-button-solid min-h-11 px-4" disabled={Boolean(busy) || !closed.length}>{busy === "what" ? "Running what-if…" : "Run what-if"}</button>
          {whatError && <p role="alert" className="text-sm text-coral">{whatError}</p>}
        </form>
        {whatResult && <WhatIfResults result={whatResult} />}
      </Card>
      <Card title="Monte Carlo risk" subtitle="Sample complete realized sessions to preserve their within-day trade order.">
        <form className="space-y-4" onSubmit={runMonte}>
          <label className="analysis-field max-w-xs">Source results
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="actual">Actual closed trades</option><option value="scenario">Latest what-if scenario</option>
            </select>
          </label>
          <Inputs fields={mcFields} values={mc} onChange={setMc} required />
          <button className="ui-button-solid min-h-11 px-4" disabled={Boolean(busy) || !closed.length}>{busy === "monte" ? "Running Monte Carlo…" : "Run Monte Carlo"}</button>
          {mcError && <p role="alert" className="text-sm text-coral">{mcError}</p>}
        </form>
        {mcResult && <MonteResults result={mcResult} />}
      </Card>
    </div>
  );
}
