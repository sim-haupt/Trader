import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import analysisService from "../../services/analysisService";
import { buildRiskAnalytics, makeRiskRecords, number, RISK_LIMITS } from "../../utils/riskAnalytics";
import { formatCurrency } from "../../utils/formatters";
import Card from "../ui/Card";
import { Table } from "./PerformanceIntelligence";
import SimulationLab from "./SimulationLab";

const money = (value) => value == null ? "–" : formatCurrency(value);
const fixed = (value, digits = 1) => value == null ? "–" : Number(value).toFixed(digits);
const pct = (value) => value == null ? "–" : `${fixed(value)}%`;
const metricHeadings = ["Trades", "Sessions", "Trades/session", "Win rate", "Net expectancy", "Avg R", "Net P&L", "Avg hold", "Risk violations"];
const metricCells = (row) => [
  row.count, row.days, fixed(row.frequency), pct(row.winRate), money(row.expectancy),
  row.averageR == null ? "–" : `${fixed(row.averageR, 2)}R (${row.rCount})`,
  money(row.pnl), row.holdingSeconds == null ? "–" : `${fixed(row.holdingSeconds / 60)} min`, row.riskViolations
];

function MetricStrip({ metrics }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
    {metrics.map(([label, value, help]) => <div key={label}>
      <dt className="text-sm text-mist" title={help}>{label}</dt><dd className="mt-1 text-lg tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

function RiskSettings({ profile, onSave }) {
  const [limits, setLimits] = useState(profile.limits);
  const [rules, setRules] = useState(profile.rules);
  const [tags, setTags] = useState(profile.tags.join(", "));
  const [ruleName, setRuleName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function persist(event) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const next = await analysisService.saveRiskProfile({
        limits: Object.fromEntries(RISK_LIMITS.map(([key]) => [key, number(limits[key])])),
        rules, tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))]
      });
      onSave(next);
      setStatus("Risk settings saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  function addRule() {
    const label = ruleName.trim();
    if (!label || rules.length >= 30 || rules.some((rule) => rule.label.toLowerCase() === label.toLowerCase())) return;
    setRules((current) => [...current, { id: crypto.randomUUID(), label }]);
    setRuleName("");
  }

  return (
    <details className="analysis-panel">
      <summary className="cursor-pointer font-semibold">Configure risk limits and trading rules</summary>
      <form className="mt-4 space-y-5" onSubmit={persist}>
        <p className="text-sm text-mist">Leave a limit blank to disable it. Current limits are applied to the selected journal history.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {RISK_LIMITS.map(([key, label]) => <label className="analysis-field" key={key}>{label}
            <input value={limits[key] ?? ""} type="number" inputMode={key === "lossStreak" ? "numeric" : "decimal"}
              min={key === "lossStreak" ? 1 : 0.01} step={key === "lossStreak" ? 1 : 0.01} max={key === "lossStreak" ? 1000 : 1_000_000_000}
              onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value }))} />
          </label>)}
        </div>
        <div className="space-y-2">
          <label className="analysis-field">New trading rule
            <input maxLength={100} value={ruleName} onChange={(event) => setRuleName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRule(); } }} />
          </label>
          <button type="button" className="ui-button min-h-11 px-3" disabled={!ruleName.trim() || rules.length >= 30} onClick={addRule}>Add rule</button>
          <ul className="divide-y divide-[var(--line)]">
            {rules.map((rule) => <li className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm" key={rule.id}>
              <span>{rule.label}</span><button aria-label={`Remove ${rule.label}`} className="ui-button min-h-11 px-3" type="button"
                onClick={() => setRules((current) => current.filter(({ id }) => id !== rule.id))}>Remove</button>
            </li>)}
          </ul>
        </div>
        <label className="analysis-field">Custom behavioral tags (comma-separated)
          <input value={tags} maxLength={3000} onChange={(event) => setTags(event.target.value)} />
        </label>
        <button className="ui-button-solid min-h-11 px-4" disabled={saving}>Save risk settings</button>
        {status && <p role="status" className="text-sm">{status}</p>}
      </form>
    </details>
  );
}

function RiskDashboard({ records, profile, onSave }) {
  const risk = useMemo(() => buildRiskAnalytics(records, profile.limits), [records, profile.limits]);
  const [concentration, setConcentration] = useState("Ticker");
  const [behaviorMin, setBehaviorMin] = useState(1);
  const violationRows = records.filter((record) => risk.violations.get(record.id)?.length);
  const latest = risk.daily.at(-1);
  const knownRisk = (row) => row.entries > row.missingRisk;
  return (
    <div className="space-y-4">
      <RiskSettings profile={profile} onSave={onSave} />
      <Card title="Historical risk" subtitle="Journal-based monitoring · New York trading days">
        <MetricStrip metrics={[
          ["Worst daily realized loss", money(risk.maxDailyLoss), "Lowest running realized P&L of any selected session, measured below zero."],
          ["Average known initial risk", money(risk.averageRisk), "Original planned risk, or first actual fill to a valid recorded stop."],
          ["Risk data coverage", `${risk.riskCoverage} / ${records.length}`],
          ["Risk / share sizing variability", `${risk.riskCV == null ? "–" : pct(risk.riskCV * 100)} / ${risk.shareCV == null ? "–" : pct(risk.shareCV * 100)}`, "Sample standard deviation divided by mean, for known risk and recorded share counts."],
          ["Expectancy in planned R", risk.performance.averageR == null ? "–" : `${fixed(risk.performance.averageR, 2)}R (${risk.performance.rCount})`, "Mean net P&L divided by original planned risk per covered trade."],
          ["Latest / longest daily loss streak", latest ? `${latest.losses} / ${risk.longestLosses}` : "–"],
          ["Entries flagged", violationRows.length, "Distinct trades with at least one modeled risk rule breach."],
          ["Max realized drawdown", risk.performance.closed ? money(risk.drawdown.maxDrawdown) : "–", "Largest peak-to-trough decline in the selected closed-trade history."],
          ["Longest completed recovery", risk.drawdown.tradesRequiredToRecover
            ? `${fixed(risk.drawdown.longestRecoveryDays, 2)} days · ${risk.drawdown.tradesRequiredToRecover} trades` : "–",
            "Elapsed days from an equity peak to the next matching or higher realized equity."]
        ]} />
        <p className="mt-4 text-sm text-mist">Exposure uses original planned risk where available, otherwise the first actual fill’s distance to the recorded stop. Open positions contribute to known exposure only. Results reflect the selected report filters.</p>
        <div className="mt-4 grid gap-5 xl:grid-cols-2">
          <Table caption="Daily risk and thresholds" headings={["Session", "Closed P&L", "Worst P&L", "New risk", "Peak overlap", "Missing risk", "Reached"]}
            rows={risk.daily.slice().reverse().map((day) => [day.day, money(day.observedCloses ? day.pnl : null), money(day.observedCloses ? day.low : null),
              money(knownRisk(day) ? day.dailyRisk : null), money(day.peakRisk > 0 ? day.peakRisk : null), day.missingRisk,
              [profile.limits.dailyLoss > 0 && day.low <= -profile.limits.dailyLoss ? "Loss" : null,
                profile.limits.dailyProfit > 0 && day.high >= profile.limits.dailyProfit ? "Profit" : null].filter(Boolean).join(" / ") || "–"])} />
          <Table caption="Weekly risk exposure" headings={["Week of", "Entries", "New risk", "Missing risk"]}
            rows={risk.weekly.slice().reverse().map((row) => [row.week, row.entries, money(row.entries > row.missing ? row.risk : null), row.missing])} />
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm">Risk violations and original plans</summary>
          <div className="mt-3 space-y-4">
            <Table caption="Risk violations" headings={["Trade", "Date", "Checked risk", "Flags", "Detail"]}
              rows={violationRows.slice().reverse().map((row) => [{ key: row.id, label: row.ticker }, row.day, money(row.risk), risk.violations.get(row.id).join(", "),
                <Link to={`/trades/${row.id}`} className="text-[var(--accent)]">Open trade</Link>])} />
            <Table caption="Observed versus planned risk" headings={["Trade", "Planned", "First-fill stop risk", "Difference", "Gross MAE", "Realized net"]}
              rows={risk.plannedRiskRows.slice().reverse().map((row) => [
                { key: row.id, label: `${row.day} · ${row.ticker}` }, money(row.planned), money(row.initial), money(row.initial != null && row.planned != null ? row.initial - row.planned : null), money(row.mae), money(row.net)
              ])} />
          </div>
        </details>
      </Card>
      <Card title="Risk concentration" subtitle="Known committed risk by ticker, setup, or entry session.">
        <label className="analysis-field mb-3 max-w-52">Group by
          <select value={concentration} onChange={(event) => setConcentration(event.target.value)}>
            {Object.keys(risk.concentration).map((group) => <option key={group}>{group}</option>)}
          </select>
        </label>
        <Table caption="Risk concentration" headings={[concentration, "Known risk", "Coverage", ...metricHeadings]}
          rows={risk.concentration[concentration].sort((a, b) => b.committed - a.committed).map((row) => [
            row.label, money(row.covered ? row.committed : null), `${row.covered} / ${row.count}`, ...metricCells(row)
          ])} />
      </Card>
      <Card title="Performance after wins, losses, and daily thresholds" subtitle="Each entry is classified using results already realized in its New York session. Cohorts may overlap.">
        <Table caption="Performance following prior events" headings={["Before entry", ...metricHeadings]}
          rows={risk.underRules.map((row) => [row.label, ...metricCells(row)])} />
      </Card>
      <Card title="Discipline and behavior" subtitle="Self-reported observations. The score is followed rules divided by assessed rules. Trade outcomes are excluded from the score.">
        <MetricStrip metrics={[
          ["Discipline score", pct(risk.disciplineScore)], ["Assessed rules", risk.checks], ["Trades assessed", risk.observed]
        ]} />
        <label className="analysis-field mb-3 mt-4 max-w-52">Minimum trades per group
          <input type="number" min={1} max={1000} value={behaviorMin}
            onChange={(event) => setBehaviorMin(Math.max(1, Number(event.target.value) || 1))} />
        </label>
        <Table caption="Behavior and outcomes" headings={["Observation", ...metricHeadings]}
          rows={risk.behavior.filter((row) => row.count >= behaviorMin).map((row) => [row.label, ...metricCells(row)])} />
        <p className="mt-3 text-sm text-mist">Frequency is the number of matching trades per session with that observation. Groups can overlap. Small samples and associations are descriptive.</p>
      </Card>
    </div>
  );
}

export default function RiskWorkspace({ trades }) {
  const [view, setView] = useState("risk");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const records = useMemo(() => makeRiskRecords(trades), [trades]);

  useEffect(() => {
    let active = true;
    setError("");
    analysisService.getRiskProfile().then((value) => { if (active) setProfile(value); })
      .catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [revision]);

  return (
    <div className="space-y-4">
      <nav className="analysis-tabs" aria-label="Risk and simulation views">
        <button type="button" aria-pressed={view === "risk"} onClick={() => setView("risk")}>Risk &amp; discipline</button>
        <button type="button" aria-pressed={view === "simulation"} onClick={() => setView("simulation")}>Simulation lab</button>
      </nav>
      {error && <p role="alert" className="analysis-panel text-sm text-coral">{error} <button type="button" className="underline" onClick={() => setRevision((n) => n + 1)}>Retry</button></p>}
      {profile ? view === "risk"
        ? <RiskDashboard records={records} profile={profile} onSave={setProfile} />
        : <SimulationLab records={records} profile={profile} onSaveProfile={setProfile} />
        : !error && <p role="status" className="analysis-panel text-sm text-mist">Loading risk settings…</p>}
    </div>
  );
}
