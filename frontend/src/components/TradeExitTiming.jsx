import { useEffect, useMemo, useState } from "react";
import Card from "./ui/Card";
import ScalpExitChart from "./ScalpExitChart";
import ScalpStrategyForm from "./ScalpStrategyForm";
import analysisService from "../services/analysisService";
import { formatCurrency } from "../utils/formatters";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hourCycle: "h23"
});
const prices = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const labels = { tick: "Trade prints", second: "One-second bars", minute: "One-minute bars" };
const tones = (value) => value > 0 ? "text-mint" : value < 0 ? "text-coral" : "text-mist";
const money = (value) => value == null ? "–" : formatCurrency(value);
const change = (value) => value == null ? "–" : `${value > 0 ? "+" : ""}${money(value)}`;
const price = (value) => value == null ? "–" : prices.format(value);
const duration = (value) => value == null ? "–" : `${Number(value.toFixed(2))}s`;

function offset(seconds, minuteMode) {
  if (!seconds) return "Actual exit";
  return `${seconds < 0 ? "−" : "+"}${minuteMode ? Math.abs(seconds) / 60 : Math.abs(seconds)}${minuteMode ? "m" : "s"}`;
}

function exactTime(value) {
  if (value == null) return "–";
  const stamp = typeof value === "string" ? value.match(/\.(\d{4,9})Z$/)?.[1] : null;
  return clock.format(new Date(value)) + (stamp?.slice(3) || "");
}

function ExitMetrics({ metrics, minuteMode }) {
  const extreme = (row) => row ? `${change(row.delta)} at ${offset(row.seconds, minuteMode)}` : "–";
  const items = [
    ["Best tested", extreme(metrics.best)], ["Worst tested", extreme(metrics.worst)],
    ["Profit left after exit", money(metrics.profitLeft)], ["Exit quality", metrics.quality == null ? "–" : `${metrics.quality.toFixed(1)}%`],
    ["Post-exit MFE / MAE", `${money(metrics.postMfe)} / ${money(metrics.postMae)}`],
    ["Time to favorable peak", duration(metrics.peakSeconds)], ["Half-peak retrace", duration(metrics.reversalSeconds)],
    ["Post-exit break-even crossings", metrics.breakEven ?? "–"],
    ["Adverse slippage / share", metrics.slippage ? prices.format(metrics.slippage.perShare) : "–"]
  ];
  return <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">{items.map(([name, value]) =>
    <div key={name}><dt className="text-xs text-mist">{name}</dt><dd className="text-sm tabular-nums">{value}</dd></div>)}</dl>;
}

function Comparisons({ rows, selected, onSelect, minuteMode, details, best, resolution }) {
  return <div className="overflow-x-auto" role="region" aria-label="Exit timing comparison" tabIndex={0}>
    <table className="analysis-table text-sm tabular-nums">
      <thead><tr>{["Offset", "Price", "Net P&L", "Vs. actual", ...(details ? ["Target ET", "Observed ET", "Data"] : [])]
        .map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead>
      <tbody>{rows.map((row) => (
        <tr key={row.seconds} className={row.actual ? "bg-white/[0.08] font-semibold" : row.seconds === selected ? "bg-white/[0.05]" : ""}>
          <th scope="row"><button type="button" aria-pressed={selected === row.seconds} className="py-1 text-left" onClick={() => onSelect(row.seconds)}>
            {offset(row.seconds, minuteMode)}
          </button>{!row.actual && row.seconds === best?.seconds && <span className="ml-2 text-xs text-mint">Best</span>}</th>
          {row.reason ? <td colSpan={details ? 6 : 3} className="text-xs text-mist">{row.reason}</td> : <>
            <td>{price(row.price)}</td><td>{money(row.net)}</td><td className={tones(row.delta)}>{change(row.delta)}</td>
            {details && <><td>{exactTime(row.time)}</td><td>{row.actual ? "–" : exactTime(row.observedAt)}</td>
              <td>{row.actual ? "Recorded fill" : labels[resolution]}</td></>}
          </>}
        </tr>
      ))}</tbody>
    </table>
  </div>;
}

export default function TradeExitTiming({ tradeId }) {
  const [opened, setOpened] = useState(false);
  const [window, setWindow] = useState(300);
  const [mode, setMode] = useState("auto");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, retry] = useState(0);
  const [selected, select] = useState(0);
  const [details, setDetails] = useState(false);
  const [showFills, setShowFills] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [side, setSide] = useState("after");
  const [excludedOffsets, setExcludedOffsets] = useState([]);
  const [strategy, setStrategy] = useState(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const byOffset = useMemo(() => new Map(result?.points?.map((point) => [point.seconds, point])), [result]);
  const point = byOffset.get(selected) ?? byOffset.get(0);
  const minuteMode = result?.resolution === "minute";
  const offsets = result?.offsets ?? [];
  const tableRows = result?.points?.filter((row) => row.actual || row.seconds === selected || row.seconds === result.metrics.best?.seconds || (
    ((side === "before" && row.seconds < 0) || (side === "after" && row.seconds > 0) || side === "both") &&
    offsets.includes(Math.abs(row.seconds)) && !excludedOffsets.includes(Math.abs(row.seconds))
  )).map((row) => row.actual ? { ...row, price: result.exitPrice } : row);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    select(0);
    analysisService.getExitTiming(tradeId, { window, mode }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [opened, tradeId, window, mode, refresh]);

  async function simulate(settings) {
    setStrategyBusy(true);
    setStrategy(null);
    try {
      setStrategy(await analysisService.runScalpStrategy(tradeId, settings));
    } catch (failure) {
      setStrategy({ reason: failure.message });
    } finally {
      setStrategyBusy(false);
    }
  }

  return (
    <Card title="Scalp exit analyzer" bodyClassName="space-y-4"
      action={!opened && <button type="button" className="ui-button min-h-11 px-4" onClick={() => setOpened(true)}>Compare exits</button>}>
      {!opened ? <p className="text-sm text-mist">Compare historical exit prices and test alternative exit rules.</p> : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="analysis-field">Window on each side
              <select value={window} onChange={(event) => setWindow(Number(event.target.value))}>
                {[30, 60, 120, 300, 900, 1800].map((seconds) => <option key={seconds} value={seconds}>{seconds < 300 ? `${seconds}s` : `${seconds / 60}m`}</option>)}
              </select>
            </label>
            <label className="analysis-field">Resolution
              <select value={mode} onChange={(event) => {
                const next = event.target.value;
                setMode(next);
                if (next === "minute" && window < 60) setWindow(60);
              }}>
                <option value="auto">Highest available</option><option value="minute">Minute bars</option>
              </select>
            </label>
            <span className="pb-2 text-sm text-mist" role="status">{busy ? "Loading prices…" :
              result?.feed ? `${result.feed} · ${labels[result.resolution]}` : ""}</span>
          </div>
          {error && <p role="alert" className="text-sm text-coral">{error} <button type="button" className="underline" onClick={() => retry(refresh + 1)}>Retry</button></p>}
          {!busy && result?.reason && <p className="text-sm text-mist">{result.reason}</p>}
          {!busy && result?.points && (
            <>
              {minuteMode && <p className="text-sm text-mist">This view uses minute bars. Choose a wider window for more minute offsets.</p>}
              {result.partialWindow && <p className="text-sm text-mist">Trade-print coverage is limited to 30 seconds on either side. Select minute bars to compare a wider window.</p>}
              {!result.points.some((sample) => sample.seconds && sample.net != null) &&
                <p className="text-sm text-mist">No historical exit prices were available for this window.</p>}
              {result.approximate && <p className="text-sm text-mist">Uses reported entry and exit prices.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="ui-button min-h-11 px-3" aria-pressed={selectMode}
                  onClick={() => setSelectMode(!selectMode)}>{selectMode ? "Switch to pan" : "Select on chart"}</button>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showFills} onChange={(event) => setShowFills(event.target.checked)} /> Execution markers</label>
              </div>
              <ScalpExitChart data={result} selected={point} onSelect={select} selectMode={selectMode} showFills={showFills} />
              {result.points.length > 1 && <label className="analysis-field">Hypothetical exit offset
                <input type="range" min={result.points[0].seconds} max={result.points.at(-1).seconds} step={minuteMode ? 60 : 1}
                  value={point?.seconds ?? 0} onChange={(event) => select(Number(event.target.value))} />
              </label>}
              {point && <p className="text-sm tabular-nums" aria-live="off">
                {offset(point.seconds, minuteMode)} · {exactTime(point.time)} ET · {point.reason || `${money(point.net)} net (${change(point.delta)} vs. actual)`}
              </p>}
              <ExitMetrics metrics={result.metrics} minuteMode={minuteMode} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="analysis-field">Show offsets
                  <select value={side} onChange={(event) => setSide(event.target.value)}><option value="after">After exit</option><option value="before">Before exit</option><option value="both">Both</option></select>
                </label>
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={details} onChange={(event) => setDetails(event.target.checked)} /> Exact timestamps</label>
                <details className="self-center text-sm">
                  <summary className="cursor-pointer">Choose offsets</summary>
                  <div className="flex max-w-sm flex-wrap gap-2 pt-2">{offsets.map((seconds) => <label key={seconds} className="flex items-center gap-1">
                    <input type="checkbox" checked={!excludedOffsets.includes(seconds)}
                      onChange={(event) => setExcludedOffsets(event.target.checked ? excludedOffsets.filter((value) => value !== seconds) : [...excludedOffsets, seconds])} />
                    {minuteMode ? `${seconds / 60}m` : `${seconds}s`}
                  </label>)}</div>
                </details>
              </div>
              <Comparisons rows={tableRows} selected={selected} onSelect={select} minuteMode={minuteMode} details={details}
                best={result.metrics.best} resolution={result.resolution} />
              <p className="text-xs text-mist">Prices are historical prints or completed bar closes. MFE and MAE use observed extrema. Estimated net retains recorded costs.</p>
              <section className="space-y-3 border-t border-[var(--line)] pt-4" aria-label="What-if exit rules">
                <h3 className="text-sm font-semibold">What-if exit rules</h3>
                <ScalpStrategyForm onRun={simulate} busy={strategyBusy} mode={mode} />
                {strategy && <p role="status" className="text-sm">
                  {strategy.reason || `${money(strategy.net)} estimated net · ${change(strategy.delta)} vs. actual · ${labels[strategy.resolution]} · ${strategy.orders.map((order) =>
                    `${order.trigger} at ${exactTime(order.time)} ET (${price(order.price)})`).join(" · ")}`}
                </p>}
              </section>
            </>
          )}
        </>
      )}
    </Card>
  );
}
