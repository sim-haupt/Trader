import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../ui/Card";
import ScalpStrategyForm, { STRATEGIES } from "../ScalpStrategyForm";
import ExitPerformanceViews from "./ExitPerformanceViews";
import analysisService from "../../services/analysisService";
import { formatCurrency } from "../../utils/formatters";
import { DEFAULT_OFFSETS, DEFAULT_POST } from "../../utils/exitReportMetrics.mjs";

const defaultSecond = { offsets: DEFAULT_OFFSETS, windows: DEFAULT_POST };
const defaultMinute = { offsets: [60, 120, 180, 300], windows: [60, 120, 180, 300] };
const initialOptions = { ...defaultSecond, mode: "auto", pricing: "preferred", matched: false, activeOffset: 5,
  activeWindow: 30, group: "setup", period: "monthly", rolling: 20 };

function intervals(value, maximum, mode) {
  if (!/^\s*\d+(?:[\s,]+\d+)*\s*$/.test(value)) return null;
  const list = [...new Set(value.trim().split(/[\s,]+/).map(Number))].sort((a, b) => a - b);
  return list.length <= maximum && list.every((item) => item > 0 && item <= 300 && (mode !== "minute" || item % 60 === 0)) ? list : null;
}

function metadata(trade) {
  return {
    id: trade.id, symbol: trade.symbol, entryDate: trade.entryDate, exitDate: trade.exitDate, entryPrice: trade.entryPrice,
    entryRelativeVolume: trade.entryRelativeVolume, quantity: trade.quantity, setup: trade.setup, strategy: trade.strategy,
    analysis: { execution: { exitEfficiency: trade.analysis?.execution?.exitEfficiency },
      snapshot: { atrPercent: trade.analysis?.snapshot?.atrPercent, regime: trade.analysis?.snapshot?.regime,
        marketDirection: trade.analysis?.snapshot?.marketDirection } }
  };
}

export default function ScalpExitReport({ trades }) {
  const request = useRef(null);
  const worker = useRef(null);
  const workerRows = useRef(null);
  const workerVersion = useRef(0);
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [offsetInput, setOffsetInput] = useState(DEFAULT_OFFSETS.join(", "));
  const [windowInput, setWindowInput] = useState(DEFAULT_POST.join(", "));
  const [snapshot, setSnapshot] = useState(null);
  const [report, setReport] = useState(null);
  const [simulation, setSimulation] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  const eligible = useMemo(() => trades.filter((trade) => {
    const fills = trade.executions?.filter(({ source }) => source === "IMPORTED");
    const entry = Date.parse(fills?.[0]?.occurredAt ?? trade.entryDate);
    const exit = Date.parse(fills?.at(-1)?.occurredAt ?? trade.exitDate);
    const held = (exit - entry) / 1000;
    return trade.exitDate && held > 0 && held >= Number(low || 0) && held <= Number(high || Infinity);
  }).sort((a, b) => Date.parse(a.exitDate) - Date.parse(b.exitDate)), [trades, low, high]);

  useEffect(() => {
    worker.current = new Worker(new URL("../../utils/exitReport.worker.js", import.meta.url), { type: "module" });
    worker.current.onmessage = ({ data }) => {
      if (data.version !== workerVersion.current) return;
      if (data.error) setError(data.error);
      else setReport(data.report);
    };
    worker.current.onerror = () => setError("Exit report calculation failed.");
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => {
    setSnapshot(null);
    setReport(null);
    setSimulation(null);
    setProgress(null);
    setError("");
    workerVersion.current += 1;
    return () => request.current?.abort();
  }, [eligible, options.mode, options.offsets, options.windows]);

  useEffect(() => {
    if (!snapshot || !worker.current) return;
    workerVersion.current += 1;
    const changed = workerRows.current !== snapshot;
    workerRows.current = snapshot;
    worker.current.postMessage({ ...(changed && { rows: snapshot }), options, version: workerVersion.current });
  }, [snapshot, options]);

  function update(key, value) { setOptions((current) => ({ ...current, [key]: value })); }

  function changeMode(mode) {
    const defaults = mode === "minute" ? defaultMinute : defaultSecond;
    setOffsetInput(defaults.offsets.join(", "));
    setWindowInput(defaults.windows.join(", "));
    setOptions((current) => ({ ...current, ...defaults, mode, pricing: mode === "minute" ? "price" : "preferred",
      activeOffset: defaults.offsets[0], activeWindow: defaults.windows[0] }));
  }

  function apply(event) {
    event.preventDefault();
    const offsets = intervals(offsetInput, 24, options.mode);
    const windows = intervals(windowInput, 12, options.mode);
    if (!offsets || !windows) {
      setError("Use 1–300 seconds, with up to 24 offsets and 12 windows. Minute mode uses multiples of 60.");
      return;
    }
    setError("");
    setOptions((current) => ({ ...current, offsets, windows,
      activeOffset: offsets.includes(Math.abs(current.activeOffset)) ? current.activeOffset : offsets[0],
      activeWindow: windows.includes(current.activeWindow) ? current.activeWindow : windows[0] }));
  }

  async function run(mode, rule) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const rows = new Map();
    setError("");
    setProgress({ done: 0, total: eligible.length, label: "Reading saved results" });
    function publish() {
      setSnapshot(eligible.map((trade) => ({ trade: metadata(trade), row: rows.get(trade.id) ?? { id: trade.id, status: "pending" } })));
    }
    async function processBatch(stage, trades) {
      const batch = await analysisService.getExitPerformance(stage, { ids: trades.map(({ id }) => id), mode: options.mode,
        offsets: options.offsets, windows: options.windows }, signal);
      batch.forEach((row) => rows.set(row.id, row));
    }

    try {
      if (rule) {
        const count = Math.min(20, eligible.length);
        const sample = Array.from({ length: count }, (_, index) => eligible[Math.round(index * (eligible.length - 1) / Math.max(1, count - 1))]);
        const scenarios = [];
        for (let index = 0; index < sample.length && !signal.aborted; index += 2) {
          setProgress({ label: "Testing strategy sample", done: index, total: count });
          scenarios.push(...await Promise.all(sample.slice(index, index + 2).map((trade) =>
            analysisService.runScalpStrategy(trade.id, rule, signal).catch(() => null))));
        }
        if (!signal.aborted) {
          const matched = scenarios.filter((item) => Number.isFinite(item?.net) && (options.mode === "minute" ? item.resolution === "minute" : item.resolution !== "minute"));
          setSimulation({ type: rule.type, total: sample.length, n: matched.length,
            actual: matched.reduce((sum, item) => sum + item.actualNet, 0), simulated: matched.reduce((sum, item) => sum + item.net, 0) });
        }
        return;
      }

      for (let index = 0; index < eligible.length && !signal.aborted; index += 120) {
        await processBatch("read", eligible.slice(index, index + 120));
        if (!signal.aborted) setProgress({ label: "Reading saved results", done: Math.min(index + 120, eligible.length), total: eligible.length });
      }
      if (signal.aborted) return;
      publish();
      if (mode === "collect") {
        const missing = eligible.filter(({ id }) => rows.get(id)?.status !== "ready");
        for (let index = 0; index < missing.length && !signal.aborted; index += 2) {
          setProgress({ label: "Collecting historical prices", done: index, total: missing.length });
          await processBatch("collect", missing.slice(index, index + 2));
          if (!signal.aborted && (index + 2 >= missing.length || index % 20 === 18)) publish();
        }
      }
    } catch (failure) {
      if (!signal.aborted) {
        if (!rule && rows.size) publish();
        setError(failure.message);
      }
    } finally {
      if (request.current === controller) setProgress(null);
    }
  }

  return <Card title="Exit performance analytics" subtitle="Analyze the closed trades in the current report filters. Historical prices are collected in batches and saved for reuse."
    bodyClassName="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="analysis-field">Market resolution<select value={options.mode} onChange={(event) => changeMode(event.target.value)}>
        <option value="auto">Highest available</option><option value="minute">Minute bars</option>
      </select></label>
      <label className="analysis-field">Pricing basis<select value={options.pricing} disabled={options.mode === "minute"}
        onChange={(event) => update("pricing", event.target.value)}>
        <option value="preferred">Quotes preferred</option><option value="quote">Quotes only</option><option value="price">Trade prices only</option>
      </select></label>
      <label className="analysis-field">Min hold (s)<input type="number" min="0" value={low} onChange={(event) => setLow(event.target.value)} /></label>
      <label className="analysis-field">Max hold (s)<input type="number" min="1" value={high} onChange={(event) => setHigh(event.target.value)} /></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={options.matched}
        onChange={(event) => update("matched", event.target.checked)} /> Same trades at all offsets</label>
    </div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={apply}>
      <label className="analysis-field w-full sm:w-auto">Exit offsets (seconds)
        <input value={offsetInput} onChange={(event) => setOffsetInput(event.target.value)} />
      </label>
      <label className="analysis-field w-full sm:w-auto">Post-exit windows (seconds)
        <input value={windowInput} onChange={(event) => setWindowInput(event.target.value)} />
      </label>
      <button type="submit" className="ui-button min-h-11 px-3">Apply intervals</button>
    </form>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="ui-button min-h-11 px-3" disabled={Boolean(progress) || !eligible.length}
        onClick={() => run("read")}>Load saved results</button>
      <button type="button" className="ui-button-solid min-h-11 px-3" disabled={Boolean(progress) || !eligible.length}
        onClick={() => run("collect")}>Collect missing data</button>
      {progress && <button type="button" className="ui-button min-h-11 px-3" onClick={() => request.current?.abort()}>Stop</button>}
      <span className="text-sm text-mist">{eligible.length} eligible closed trades</span>
    </div>
    {error && <p className="text-sm text-coral" role="alert">{error}</p>}
    {progress && <p className="text-sm text-mist" role="status">{progress.label} · {progress.done} / {progress.total}</p>}
    {report && <>
      <p className="text-sm text-mist">{report.summary.analyzed} analyzed · {report.summary.pending} pending · {report.summary.eligible - report.summary.analyzed - report.summary.pending} unavailable
        · {report.summary.priced} with comparable prices · {report.summary.matched} matched at every selected offset</p>
      <ExitPerformanceViews report={report} options={options} update={update} />
    </>}
    <div className="space-y-3 border-t border-[var(--line)] pt-3">
      <p className="text-sm text-mist">Rule simulations use a separate sample of up to 20 trades.</p>
      <ScalpStrategyForm onRun={(rule) => run("strategy", rule)} busy={Boolean(progress) || !eligible.length}
        mode={options.mode} button="Compare strategy" />
      {simulation && <p role="status" className="text-sm">{STRATEGIES[simulation.type]} · {simulation.n} of {simulation.total} matched trades
        {simulation.n ? ` · Actual ${formatCurrency(simulation.actual)} · Simulated ${formatCurrency(simulation.simulated)} · Difference ${formatCurrency(simulation.simulated - simulation.actual)}` : " · No supported results"}</p>}
    </div>
  </Card>;
}
