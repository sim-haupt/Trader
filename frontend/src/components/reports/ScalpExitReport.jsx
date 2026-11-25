import { useEffect, useMemo, useRef, useState } from "react";
import Card from "../ui/Card";
import { Table } from "./PerformanceIntelligence";
import analysisService from "../../services/analysisService";
import { formatCurrency, formatPercent } from "../../utils/formatters";

const offsets = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 120, 300];
const windows = [30, 60];
const options = { automatic: true, offsets, windows, pricing: "preferred", activeWindow: 30 };
const retryDelay = 15 * 60_000;
const money = (value) => value == null ? "–" : formatCurrency(value);
const tradeCount = (count) => `${count} ${count === 1 ? "trade" : "trades"}`;
const dollarsChange = (value) => `${value > 0 ? "+" : ""}${money(value)}`;
const percentChange = (value) => `${value > 0 ? "+" : ""}${formatPercent(value)}`;

function useAutomaticCollection(history) {
  const [results, setResults] = useState(() => new Map());
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ids = [...new Set(history.filter(({ entryDate }) => Number.isFinite(Date.parse(entryDate))).map(({ id }) => id))];
    const request = new AbortController();
    const { signal } = request;
    let timer;
    if (!ids.length) {
      setResults(new Map());
      setProgress(null);
      setError("");
      return;
    }

    async function collect() {
      const rows = new Map();
      const publish = () => { if (!signal.aborted) setResults(new Map(rows)); };
      const batch = async (stage, ids) => {
        const result = await analysisService.getExitPerformance(stage, { ids, offsets, windows, mode: "auto" }, signal);
        result.forEach((row) => rows.set(row.id, row));
      };

      try {
        setError("");
        setProgress({ label: "Checking saved analysis", done: 0, total: ids.length });
        for (let index = 0; index < ids.length && !signal.aborted; index += 120) {
          await batch("read", ids.slice(index, index + 120));
          if (!signal.aborted) setProgress({ label: "Checking saved analysis", done: Math.min(index + 120, ids.length), total: ids.length });
        }
        if (signal.aborted) return;
        publish();
        const missing = ids.filter((id) => {
          const row = rows.get(id);
          return row?.status === "pending" || row?.needsCollection;
        });
        for (let index = 0; index < missing.length && !signal.aborted; index += 4) {
          setProgress({ label: "Analyzing historical prices", done: index, total: missing.length });
          await batch("collect", missing.slice(index, index + 4));
          if (index === 0 || index % 40 === 36 || index + 4 >= missing.length) publish();
        }
      } catch {
        if (!signal.aborted) {
          if (rows.size) publish();
          setError("Historical analysis was interrupted. It will retry automatically.");
        }
      } finally {
        if (!signal.aborted) {
          setProgress(null);
          timer = setTimeout(collect, retryDelay);
        }
      }
    }
    collect();
    return () => {
      request.abort();
      clearTimeout(timer);
    };
  }, [history]);

  return { results, progress, error };
}

function Reading({ label, value, sample, tone = "", detail }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
    <dt className="text-sm text-white/80">{label}</dt>
    <dd className="text-right">
      <span className={`block text-base font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="block text-xs text-mist">{sample ? tradeCount(sample) : "No data"}</span>
    </dd>
    {detail && <dd className="col-span-2 text-xs leading-relaxed text-mist">{detail}</dd>}
  </div>;
}

function signedTone(value) {
  return value > 0 ? "text-mint" : value < 0 ? "text-coral" : "";
}

function TimingCell({ row, highlight }) {
  if (!row?.n) return <span className="text-mist" aria-label="No comparable prices">–</span>;
  return <div className={`my-1 rounded px-1.5 py-1 ${highlight ? "bg-mint/10" : ""}`}>
    <span className={`block font-semibold ${signedTone(row.median)}`}>{dollarsChange(row.median)}</span>
    <span className="block text-xs text-mist">{tradeCount(row.n)}</span>
  </div>;
}

function Conclusions({ report }) {
  const { summary, entry, leading, supportedOffsets, timing } = report;
  const unavailable = summary.eligible - summary.analyzed - summary.pending;
  let headline = "No exit timing consistently improved results";
  let explanation = "The report looks for a positive median change and better results on at least 60% of trades.";
  if (leading) {
    headline = `Exiting ${Math.abs(leading.seconds)} seconds ${leading.seconds > 0 ? "later" : "earlier"} performed better`;
    explanation = `Median estimated change of ${dollarsChange(leading.median)} after fees. ${formatPercent(leading.improved)} of ${tradeCount(leading.n)} improved compared with their actual exit.`;
  } else if (!summary.eligible) {
    headline = "No trades match these filters";
    explanation = "The findings update when trades match the current report filters.";
  } else if (!supportedOffsets) {
    headline = summary.pending ? "Checking historical prices"
      : summary.priced ? "Too few comparisons for a timing conclusion" : "Exit prices unavailable";
    explanation = "An exit timing finding needs at least 20 trades with prices at the same offset.";
  }
  const shownOffsets = [...new Set([5, 15, 30, 60, ...(leading ? [Math.abs(leading.seconds)] : [])])].sort((a, b) => a - b);
  const timingByOffset = new Map(timing.map((row) => [row.seconds, row]));
  const coverage = [
    ["Trades in view", summary.eligible],
    ["With entry data", entry.n],
    ["With exit data", summary.exitAnalyzed],
    ...(summary.pending ? [["Pending", summary.pending]] : []),
    ...(unavailable ? [["No price data", unavailable]] : [])
  ];

  return <div className="space-y-5">
    <div className="space-y-1.5 border-l-2 border-white/25 pl-3">
      <h3 className="text-lg font-semibold leading-tight">{headline}</h3>
      <p className="max-w-3xl text-sm leading-relaxed text-mist">{explanation}</p>
    </div>
    <dl className="grid grid-cols-3 gap-x-3 gap-y-2 border-y border-white/10 py-3 sm:flex sm:flex-wrap sm:gap-x-7">
      {coverage.map(([label, count]) => <div key={label}>
        <dt className="text-xs text-mist">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums">{count}</dd>
      </div>)}
    </dl>
    {summary.eligible > 0 && <>
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-3" aria-label="Entry findings">
          <div>
            <h3 className="text-base font-semibold">After entry</h3>
            <p className="text-sm text-mist">{entry.move.n
              ? `${formatPercent(entry.adverse)} of covered trades moved against the entry after 30 seconds.`
              : "The 30-second move needs historical trades or second bars."}</p>
          </div>
          <dl className="space-y-2">
            <Reading label="Median move in your trade direction" value={entry.move.n ? percentChange(entry.move.median) : "–"}
              sample={entry.move.n} tone={signedTone(entry.move.median)}
              detail={entry.approximate ? `Includes ${tradeCount(entry.approximate)} with reported entry prices.` : null} />
            <Reading label="Median entry cost vs. quote midpoint"
              value={entry.midpointCost.n ? `${(entry.midpointCost.median / 100).toFixed(2)}%` : "–"}
              sample={entry.midpointCost.n} detail={entry.midpointCost.n ? "A positive value means your fill was more expensive." : null} />
          </dl>
        </section>
        <section className="space-y-3 md:border-l md:border-white/10 md:pl-5" aria-label="Exit findings">
          <div>
            <h3 className="text-base font-semibold">Around exit</h3>
            <p className="text-sm text-mist">See how much of the observed peak you gave back and what price did after you closed.</p>
          </div>
          <dl className="space-y-2">
            <Reading label="Median profit given back before closing" value={money(summary.giveback.median)} sample={summary.giveback.n} />
            <Reading label="Price moved in your favor 30s after exit" value={summary.post.n ? formatPercent(summary.post.favorable) : "–"}
              sample={summary.post.n} />
          </dl>
        </section>
      </div>
      <section className="space-y-2 border-t border-white/10 pt-4" aria-label="Exit timing comparison">
        <h3 className="text-base font-semibold">Earlier vs. later exits</h3>
        <p className="text-sm text-mist">Median estimated change in net P&L versus your actual exit.</p>
        <Table caption="Median estimated net P&L change by exit timing" headings={["Offset", "Earlier", "Later"]}
          rows={shownOffsets.map((seconds) => [`${seconds}s`, ...[-seconds, seconds].map((offset) =>
            <TimingCell key={offset} row={timingByOffset.get(offset)} highlight={leading?.seconds === offset} />)])} />
        <p className="text-xs leading-relaxed text-mist">These are historical price estimates. Trade counts vary with available prices.</p>
      </section>
    </>}
  </div>;
}

export default function ScalpExitReport({ trades, tradeHistory = trades }) {
  const { results, progress, error } = useAutomaticCollection(tradeHistory);
  const worker = useRef(null);
  const version = useRef(0);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState(false);
  const visible = useMemo(() => trades.filter(({ entryDate }) => Number.isFinite(Date.parse(entryDate))), [trades]);

  useEffect(() => {
    const instance = new Worker(new URL("../../utils/exitReport.worker.js", import.meta.url), { type: "module" });
    worker.current = instance;
    instance.onmessage = ({ data }) => {
      if (data.version !== version.current) return;
      setReportError(Boolean(data.error));
      if (!data.error) setReport(data.report);
    };
    instance.onerror = () => setReportError(true);
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    const rows = visible.map((trade) => ({
      trade: { exitDate: trade.exitDate },
      row: results.get(trade.id) ?? { id: trade.id, status: "pending" }
    }));
    worker.current?.postMessage({ rows, options, version: ++version.current });
  }, [results, visible]);

  return <Card title="Exit performance analytics" subtitle="Analyzed automatically. Findings follow your report filters."
    bodyClassName="space-y-3">
    {progress && <p className="text-sm text-mist" role="status">{progress.label} · {progress.done} of {progress.total} account trades</p>}
    {error && <p className="text-sm text-mist" role="status">{error}</p>}
    {reportError && <p className="text-sm text-coral" role="alert">The report could not summarize the saved analysis.</p>}
    {report && <Conclusions report={report} />}
  </Card>;
}
