import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Table } from "./PerformanceIntelligence";
import { formatCurrency } from "../../utils/formatters";
import { GROUPS } from "../../utils/exitReportMetrics.mjs";
import downloadCsv from "../../utils/downloadCsv";

const dash = "–";
const money = (value) => value == null ? dash : formatCurrency(value);
const pct = (value) => value == null ? dash : `${value.toFixed(1)}%`;
const seconds = (value) => value == null ? dash : `${value.toFixed(2)}s`;
const offset = (value) => `${value > 0 ? "+" : ""}${value}s`;
const covered = (summary, format = money) => summary.n ? `${format(summary.average)} (n=${summary.n})` : dash;
const tick = { fill: "#aeb0b4", fontSize: 11 };
const tooltip = { background: "#161616", border: "1px solid #303030" };

function MetricStrip({ summary }) {
  const rows = [
    ["Exit quality", `${pct(summary.quality.average)} avg · ${pct(summary.quality.median)} median`, summary.quality.n],
    ["Recorded exit efficiency", `${pct(summary.recordedEfficiency.average)} avg · ${pct(summary.recordedEfficiency.median)} median`, summary.recordedEfficiency.n],
    ["Profit left", `${money(summary.profitLeft.average)} avg · ${money(summary.profitLeft.total)} total`, summary.profitLeft.n],
    ["Better / worse alternatives", `${pct(summary.better)} / ${pct(summary.worse)}`, summary.priced],
    ["Average giveback", money(summary.giveback.average), summary.giveback.n],
    ["Average post MFE / MAE", `${money(summary.post.mfe.average)} / ${money(summary.post.mae.average)}`, summary.post.n],
    ["Average time to peak", seconds(summary.post.peak.average), summary.post.peak.n]
  ];
  return <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{rows.map(([label, value, count]) =>
    <div key={label}><dt className="text-xs text-mist">{label}</dt><dd className="mt-1 text-sm tabular-nums">{value}</dd>
      <dd className="text-xs text-mist">n={count}</dd></div>)}</dl>;
}

function Distribution({ label, data }) {
  return <div>
    <h3 className="mb-2 text-sm font-semibold">{label}</h3>
    {data?.length ? <div className="h-36 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}><CartesianGrid vertical={false} stroke="#262626" />
          <XAxis dataKey="label" tick={tick} minTickGap={22} /><YAxis allowDecimals={false} tick={tick} width={34} />
          <Tooltip contentStyle={tooltip} labelStyle={{ color: "#eee" }} /><Bar dataKey="count" name="Trades" fill="#96bbeb" />
        </BarChart>
      </ResponsiveContainer>
    </div> : <p className="text-sm text-mist">No covered observations.</p>}
  </div>;
}

function TrendLine({ data, axis, value, label, format, onSelect }) {
  if (!data.length) return <p className="text-sm text-mist">No covered observations.</p>;
  return <div className="h-44 min-w-0" role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} onClick={(event) => { if (event?.activeLabel != null) onSelect?.(Number(event.activeLabel)); }}>
        <CartesianGrid vertical={false} stroke="#262626" />
        <XAxis dataKey={axis} tick={tick} minTickGap={18} /><YAxis tick={tick} tickFormatter={format} width={62} />
        <Tooltip contentStyle={tooltip} labelStyle={{ color: "#eee" }} formatter={(amount) => format(amount)} />
        <Line dataKey={value} name={label} stroke="#96bbeb" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}

const timingHeadings = ["Offset", "Trades", "Quote-priced", "Avg. change", "Median change", "Total change",
  "Better", "Worse", "Unchanged", "Wins to losses", "Losses to wins"];
function timingCells(row, format = true) {
  return format ? [row.n, row.quote, money(row.average), money(row.median), money(row.total), pct(row.improved),
    pct(row.worsened), pct(row.unchanged), `${pct(row.winToLoss)} (n=${row.wins})`, `${pct(row.lossToWin)} (n=${row.losses})`]
    : [row.n, row.quote, row.average, row.median, row.total, row.improved, row.worsened, row.unchanged, row.winToLoss, row.lossToWin];
}

function Timing({ report, options, update }) {
  const selected = report.timing.find(({ seconds: value }) => value === options.activeOffset);
  return <div className="space-y-4">
    <TrendLine data={report.timing} axis="seconds" value="average" label="Mean net change by exit offset (s)" format={money}
      onSelect={(value) => update("activeOffset", value)} />
    <div className="max-h-80 overflow-auto">
      <Table caption="Exit improvement by offset" headings={timingHeadings} rows={report.timing.map((row) =>
        [{ key: row.seconds, label: <button type="button" aria-pressed={row.seconds === options.activeOffset}
          onClick={() => update("activeOffset", row.seconds)}>{offset(row.seconds)}</button> }, ...timingCells(row)])} />
    </div>
    <p className="text-xs text-mist">Conversion percentages use actual winners or losers with a price at that offset.</p>
    <Distribution label={`Net change distribution at ${offset(options.activeOffset)}`} data={selected?.distribution} />
  </div>;
}

function Giveback({ summary }) {
  return <div className="space-y-3">
    <p className="text-sm text-mist">Observed gross peak {covered(summary.grossPeak)} · Giveback {money(summary.giveback.median)} median / {money(summary.giveback.total)} total · {covered(summary.givebackPct, pct)} of peak</p>
    <Distribution label="Profit giveback distribution ($)" data={summary.givebackDistribution} />
    <Distribution label="Exit quality distribution (%)" data={summary.qualityDistribution} />
  </div>;
}

function PostExit({ report, options, update }) {
  const selected = report.post.find(({ seconds: value }) => value === options.activeWindow);
  return <div className="space-y-4">
    <TrendLine data={report.post.map((row) => ({ seconds: row.seconds, change: row.direction.average }))}
      axis="seconds" value="change" label="Average directional move after exit (%)" format={pct}
      onSelect={(value) => update("activeWindow", value)} />
    <Table caption="Post-exit movement" headings={["Window", "Trades", "Move", "MFE", "MAE", "Peak time", "Adverse time", "Continued", "Reversed", "New extreme", "Returned to entry"]}
      rows={report.post.map((row) => [{ key: row.seconds, label: <button type="button" aria-pressed={row.seconds === options.activeWindow}
        onClick={() => update("activeWindow", row.seconds)}>{row.seconds}s</button> }, row.n, covered(row.direction, pct),
        covered(row.mfe), covered(row.mae), covered(row.peak, seconds), covered(row.adverse, seconds),
        pct(row.favorable), pct(row.reversed), `${pct(row.newExtreme)} (n=${row.extremeN})`, pct(row.returned)])} />
    <div className="grid gap-4 md:grid-cols-2">
      <Distribution label={`Favorable excursion at ${options.activeWindow}s ($)`} data={selected?.mfeDistribution} />
      <Distribution label={`Adverse excursion at ${options.activeWindow}s ($)`} data={selected?.maeDistribution} />
    </div>
  </div>;
}

function GroupsAndTrends({ report, options, update, drillGroup, setDrillGroup }) {
  const stats = (row) => [row.n, covered(row.quality, pct), row.quality.n > 1 ? `${row.quality.deviation.toFixed(1)} pp` : dash,
    covered(row.giveback), covered(row.post.mfe), covered(row.post.mae), covered(row.timing)];
  const trendHeadings = ["Trades", "Quality", "Quality std. dev.", "Giveback", "Post MFE", "Post MAE", offset(options.activeOffset)];
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <label className="analysis-field">Group by<select value={options.group}
        onChange={(event) => { update("group", event.target.value); setDrillGroup(null); }}>
        {Object.entries(GROUPS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="analysis-field">Trend period<select value={options.period} onChange={(event) => update("period", event.target.value)}>
        <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
      </select></label>
      <label className="analysis-field">Rolling trades<select value={options.rolling} onChange={(event) => update("rolling", Number(event.target.value))}>
        {[20, 50, 100].map((value) => <option key={value}>{value}</option>)}
      </select></label>
    </div>
    <div className="max-h-80 overflow-auto">
      <Table caption="Exit performance by group" headings={[GROUPS[options.group], "Trades", "Quality", "Giveback", "Profit left", "Post MFE", "Post MAE", "Leading offset"]}
        rows={report.groups.map((row) => [{ key: row.label, label: <button type="button" aria-pressed={drillGroup === row.label}
          onClick={() => setDrillGroup(drillGroup === row.label ? null : row.label)}>{row.label}</button> },
        row.n, covered(row.quality, pct), covered(row.giveback), covered(row.profitLeft), covered(row.post.mfe),
        covered(row.post.mae), row.best ? `${offset(row.best.seconds)} · ${covered(row.best)}` : dash])} />
    </div>
    <p className="text-xs text-mist">Leading offsets are descriptive and require at least 10 covered trades.</p>
    <TrendLine data={report.rolling} axis="index" value="average" label={`Rolling ${options.rolling}-trade exit quality`} format={pct} />
    <div className="max-h-72 overflow-auto">
      <Table caption="Exit quality trend" headings={["Period (ET)", ...trendHeadings]}
        rows={report.trend.map((row) => [row.period, ...stats(row)])} />
    </div>
    <Table caption="Recent versus historical" headings={["Cohort", ...trendHeadings]}
      rows={[["Latest 20 analyzed", ...stats(report.comparison.recent)], ["Earlier analyzed", ...stats(report.comparison.historical)]]} />
    {report.alerts.map(({ metric, change }) => <p key={metric} role="status" className="text-sm text-mist">
      Review recent {metric.toLowerCase()} · {metric === "Exit quality" ? `${change.toFixed(1)} pp` : money(change)} versus earlier trades.
    </p>)}
  </div>;
}

function Drill({ rows, title }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 12) - 1));
  return <section className="space-y-3 border-t border-[var(--line)] pt-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    <Table caption="Per-trade exit results" headings={["Trade", "Exit (UTC)", "Setup", "Actual net", "Actual gross", "Observed gross peak", "Giveback", "Selected offset Δ", "Data"]}
      rows={rows.slice(current * 12, (current + 1) * 12).map((row) => [
        { key: row.id, label: <Link className="text-[var(--accent)]" to={`/trades/${row.id}`}>{row.symbol}</Link> }, row.timestamp,
        row.setup, money(row.actualNet), money(row.actualGross), money(row.grossPeak), money(row.giveback), money(row.offset?.delta),
        row.offset?.quoted ? "Quote" : row.approximate ? "Reported fills" : row.resolution
      ])} />
    {rows.length > 12 && <div className="flex items-center gap-3 text-sm">
      <button type="button" className="ui-button px-3 py-2" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button>
      <span>{current + 1} / {Math.ceil(rows.length / 12)}</span>
      <button type="button" className="ui-button px-3 py-2" disabled={(current + 1) * 12 >= rows.length} onClick={() => setPage(current + 1)}>Next</button>
    </div>}
  </section>;
}

export default function ExitPerformanceViews({ report, options, update }) {
  const [view, setView] = useState("Timing");
  const [drillGroup, setDrillGroup] = useState(null);
  function exportOffsets() {
    downloadCsv("exit-offsets.csv", [timingHeadings, ...report.timing.map((row) => [row.seconds, ...timingCells(row, false)])],
      { protectFormulas: true });
  }
  function exportTrades() {
    downloadCsv("exit-trades.csv", [["Trade ID", "Ticker", "Exit UTC", "Setup", "Actual gross", "Actual net", "Observed gross peak", "Giveback",
      "Giveback %", "Exit quality %", "Profit left", "Offset seconds", "Offset net difference", "Offset price basis", "Post window seconds", "Post MFE", "Post MAE"],
    ...report.drill.map((row) => [row.id, row.symbol, row.timestamp, row.setup, row.actualGross, row.actualNet, row.grossPeak, row.giveback,
      row.givebackPct, row.quality, row.profitLeft, options.activeOffset, row.offset?.delta, row.offset?.quoted ? "quote" : row.offset && row.resolution,
      options.activeWindow, row.post?.[2], row.post?.[3]])], { protectFormulas: true });
  }
  return <div className="space-y-4">
    <MetricStrip summary={report.summary} />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="analysis-tabs" aria-label="Exit performance views">{["Timing", "Giveback", "Post-exit", "Groups and trends"].map((value) =>
        <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setDrillGroup(null); }}>{value}</button>)}</div>
      <div className="flex gap-2">
        <button type="button" className="ui-button px-3 py-2" onClick={exportOffsets}>Export offsets</button>
        <button type="button" className="ui-button px-3 py-2" onClick={exportTrades}>Export trades</button>
      </div>
    </div>
    {view === "Timing" && <Timing report={report} options={options} update={update} />}
    {view === "Giveback" && <Giveback summary={report.summary} />}
    {view === "Post-exit" && <PostExit report={report} options={options} update={update} />}
    {view === "Groups and trends" && <GroupsAndTrends report={report} options={options} update={update} drillGroup={drillGroup} setDrillGroup={setDrillGroup} />}
    <Drill key={drillGroup ?? "all"} title={drillGroup ? `Trades in ${drillGroup}` : "Trade drill-down"}
      rows={drillGroup ? report.drill.filter((row) => row.group === drillGroup) : report.drill} />
  </div>;
}
