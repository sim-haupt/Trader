import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card";
import { __advancedAnalyticsInternals } from "../../utils/advancedAnalytics.js";
import { buildMarketAssociations, buildTimeCells, MARKET_FACTORS } from "../../utils/performanceIntelligence.js";
import { formatCurrency } from "../../utils/formatters";
import analysisService from "../../services/analysisService";

const { groupBy, summarizeGroup } = __advancedAnalyticsInternals;
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const openingMinute = 570;
const missing = "–";
const money = (value) => value == null ? missing : formatCurrency(value);
const number = (value, digits = 2) => value == null ? missing : Number(value).toFixed(digits);
const percent = (value) => value == null ? missing : `${number(value, 1)}%`;
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function Table({ headings, rows, caption, empty = "No matching trades with recorded results." }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <table className="analysis-table">
        <thead><tr>{headings.map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
        <tbody>{rows.map(([key, ...cells]) => (
          <tr key={typeof key === "object" ? key.key : key}><th scope="row">{typeof key === "object" ? key.label : key}</th>{cells.map((value, index) => <td key={index}>{value}</td>)}</tr>
        ))}</tbody>
      </table>
      {!rows.length && <p className="mt-3 text-sm text-mist">{empty}</p>}
    </div>
  );
}

const metrics = {
  expectancy: ["Net expectancy", money],
  totalNetPnl: ["Net P&L", money],
  winRate: ["Win rate", percent],
  averageR: ["Average net R", (value) => number(value)]
};

export function TimeHeatmap({ trades, timeZone }) {
  const [interval, setInterval] = useState(30);
  const [metric, setMetric] = useState("expectancy");
  const [selected, setSelected] = useState(null);
  const cells = useMemo(() => buildTimeCells(trades, interval, groupBy, summarizeGroup), [trades, interval]);
  const byKey = useMemo(() => new Map(cells.map((cell) => [cell.label, cell])), [cells]);
  const minutes = [...new Set(cells.map((cell) => cell.minute))];
  const weekdays = days.filter((day) => cells.some((cell) => cell.weekday === day));
  const chosen = byKey.get(selected);
  const maximum = cells.reduce((max, row) => Math.max(max, Math.abs(metric === "winRate" ? row[metric] - 50 : row[metric] ?? 0)), 0);
  const strongest = cells.filter((cell) => cell.sessionCount >= 10 && cell.tradeCount >= 20)
    .reduce((best, cell) => !best || cell.expectancy > best.expectancy ? cell : best, null);
  const [name, format] = metrics[metric];

  return (
    <Card title="Trading windows" subtitle={`${timeZone} · intervals anchored to the 09:30 cash open`}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="analysis-field">Interval
          <select value={interval} onChange={(event) => { setInterval(Number(event.target.value)); setSelected(null); }}>
            {[5, 15, 30, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}
          </select>
        </label>
        <label className="analysis-field">Heatmap metric
          <select value={metric} onChange={(event) => setMetric(event.target.value)}>
            {Object.entries(metrics).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <p className="mb-3 text-sm text-mist">
        {strongest ? `Highest observed net expectancy with at least 20 trades and 10 sessions: ${strongest.weekday} ${clock(strongest.minute)} ET (${money(strongest.expectancy)}, ${strongest.tradeCount} trades). Treat this as exploratory.`
          : "Window rankings require at least 20 trades and 10 sessions in a cell."}
      </p>
      <div className="max-h-[390px] overflow-auto" role="region" aria-label="Interactive time-of-day heatmap" tabIndex={0}>
        <table className="analysis-table">
          <thead className="sticky top-0 z-10 bg-[var(--surface-1)]"><tr><th scope="col">Start · From open</th>
            {weekdays.map((day) => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{minutes.map((minute) => (
            <tr key={minute}>
              <th scope="row">{clock(minute)} · {minute - openingMinute > 0 ? "+" : ""}{minute - openingMinute}m</th>
              {weekdays.map((day) => {
                const cell = byKey.get(`${day}:${minute}`);
                if (!cell) return <td key={day}>{missing}</td>;
                const value = cell[metric];
                const signed = metric === "winRate" ? value - 50 : value;
                const opacity = maximum && value != null ? 8 + Math.round(Math.abs(signed) / maximum * 24) : 0;
                const tint = `color-mix(in srgb, ${signed >= 0 ? "var(--success, #34e0a1)" : "var(--danger, #ff5f7a)"} ${opacity}%, transparent)`;
                return <td key={day}><button type="button" onClick={() => setSelected(cell.label)}
                  aria-pressed={selected === cell.label} aria-label={`${day} ${clock(minute)}, ${name} ${format(value)}, ${cell.tradeCount} trades`}
                  className="min-h-11 min-w-20 rounded border border-transparent px-2 text-right aria-pressed:border-[var(--accent)]"
                  style={{ background: tint }}>{format(value)} <span className="text-xs text-white/75">· {cell.tradeCount}</span></button></td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {chosen && (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <p className="text-sm">{chosen.weekday} {clock(chosen.minute)} ET · {chosen.sessionCount} sessions · {chosen.tradeCount} trades</p>
          <div className="mt-2 flex max-h-36 flex-wrap gap-x-5 gap-y-2 overflow-auto">
            {chosen.trades.map((trade) => <Link key={trade.id} to={`/trades/${trade.id}`} className="text-sm text-[var(--accent)]">{trade.symbol} {money(trade.netPnl)}</Link>)}
          </div>
        </div>
      )}
    </Card>
  );
}

const factorLabels = new Map(MARKET_FACTORS.map(([key, label, unit]) => [key, [label, unit]]));
export function MarketEvidence({ trades, onRefresh }) {
  const associations = useMemo(() => buildMarketAssociations(trades, groupBy), [trades]);
  const [factor, setFactor] = useState("gap");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState([]);
  const candidates = trades.filter((item) => !item.source.analysis?.collectedAt && !failed.includes(item.id)).slice(-5);
  const sessions = trades.filter((item) => Number.isFinite(item.factors[factor])).sort((a, b) => a.factors[factor] - b.factors[factor]);
  const low = sessions[Math.floor((sessions.length - 1) / 3)]?.factors[factor];
  const high = sessions[Math.floor((sessions.length - 1) * 2 / 3)]?.factors[factor];
  const bins = low === high ? [] : Array.from(groupBy(sessions, (item) =>
    item.factors[factor] <= low ? "Lower" : item.factors[factor] <= high ? "Middle" : "Upper"),
  ([name, cohort]) => {
    const row = summarizeGroup(name, cohort);
    return [name, `${number(cohort[0].factors[factor])} to ${number(cohort.at(-1).factors[factor])}`, row.tradeCount,
      row.sessionCount, money(row.expectancy), money(row.totalNetPnl)];
  });

  async function refresh() {
    setBusy(true);
    setStatus("");
    try {
      const results = await analysisService.refreshTrades(candidates.map(({ id }) => id));
      const saved = results.filter((item) => item.status === "saved").length;
      setFailed((current) => [...current, ...results.filter((item) => item.status !== "saved").map(({ id }) => id)]);
      if (saved) await onRefresh();
      setStatus(`${saved} of ${results.length} trades saved. ${results.find((item) => item.message)?.message ?? ""}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Market conditions" subtitle="Historical values at entry.">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <label className="analysis-field">Segment by
          <select value={factor} onChange={(event) => setFactor(event.target.value)}>
            {MARKET_FACTORS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {onRefresh && <button type="button" className="ui-button min-h-11 px-4" disabled={busy || !candidates.length}
          onClick={refresh}>{busy ? "Collecting historical data…" : "Collect next 5 trades"}</button>}
      </div>
      {failed.length > 0 && <button type="button" className="mb-3 self-start text-sm text-[var(--accent)]" disabled={busy}
        onClick={() => setFailed([])}>Include unavailable trades in next batch</button>}
      {status && <p role="status" className="mb-3 text-sm text-mist">{status}</p>}
      {bins.length ? <Table caption="Segmented trade performance" headings={["Band", factorLabels.get(factor)[1] || "Range", "Trades", "Sessions", "Expectancy", "Net P&L"]} rows={bins} />
        : <p className="text-sm text-mist">Value bands require distinct historical observations.</p>}
      <div className="mt-5">
        <p className="mb-3 text-sm text-mist">Pearson correlation uses session averages with at least 20 sessions. Approximate p-values use Holm correction across tested factors. Associations are exploratory and do not establish causation.</p>
        <Table caption="Market factor correlations" headings={["Market factor", "Trades", "Sessions", "Correlation", "Adjusted p"]}
          rows={associations.map((item) => [item.label, item.count, item.sessions, number(item.correlation, 3), number(item.adjustedP, 4)])} />
      </div>
    </Card>
  );
}
