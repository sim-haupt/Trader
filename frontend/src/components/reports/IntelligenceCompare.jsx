import { useState } from "react";
import intelligenceService from "../../services/intelligenceService";
import { metric, SimulationSummary } from "./IntelligenceOverview";
import { Table } from "./PerformanceIntelligence";

const choices = [
  ["session", "Entry session", ["Premarket", "Regular", "After hours", "Overnight"].map((value) => [value, value])],
  ["market", "Market condition", ["Hot", "Normal", "Cold", "Up", "Down", "Flat", "Elevated volatility", "Low volatility", "Typical volatility"].map((value) => [value, value])],
  ["result", "Trade outcome", [["win", "Winner"], ["loss", "Loser"]]],
  ["confidence", "Confidence", [["high", "High (4–5)"], ["low", "Low (1–2)"]]],
  ["compliance", "Assessed compliance", [["followed", "All assessed followed"], ["violated", "Any violation"]]]
];

function CohortForm({ label, value, onChange }) {
  const set = (key, value) => onChange((current) => ({ ...current, [key]: value }));
  return (
    <fieldset className="rounded-md border border-[var(--line)] p-4">
      <legend className="px-2 font-medium">Cohort {label}</legend>
      <div className="grid grid-cols-2 gap-3">
        {["from", "to"].map((key) => <label key={key} className="analysis-field">{key === "from" ? "From (ET)" : "To (ET)"}
          <input type="date" required value={value[key]} onChange={(event) => set(key, event.target.value)} />
        </label>)}
        <label className="analysis-field col-span-2">Setup name
          <input value={value.setup || ""} maxLength={120} onChange={(event) => set("setup", event.target.value)} />
        </label>
        {choices.map(([key, title, options]) => <label key={key} className="analysis-field">{title}
          <select value={value[key] || ""} onChange={(event) => set(key, event.target.value)}>
            <option value="">All</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>)}
      </div>
    </fieldset>
  );
}

export default function IntelligenceCompare({ ranges, simulation }) {
  const [first, setFirst] = useState(ranges.current);
  const [second, setSecond] = useState(ranges.previous);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const clean = (value) => Object.fromEntries(Object.entries(value).filter(([, field]) => field));
    try { setResult(await intelligenceService.compare(clean(first), clean(second))); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  function row(label, values, unit) {
    return [label, ...values.map((value) => metric(value, unit))];
  }

  return (
    <section className="analysis-panel space-y-4">
      <h2 className="text-lg font-semibold">Compare trading cohorts</h2>
      <form className="space-y-4" onSubmit={run}>
        <div className="grid gap-4 lg:grid-cols-2">
          <CohortForm label="A" value={first} onChange={setFirst} />
          <CohortForm label="B" value={second} onChange={setSecond} />
        </div>
        <button className="ui-button-solid min-h-11 px-4" disabled={busy}>{busy ? "Comparing…" : "Compare cohorts"}</button>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      </form>
      {result && <div className="space-y-2">
        <p className="text-sm text-mist">A {result.ranges.a.from} to {result.ranges.a.to} · B {result.ranges.b.from} to {result.ranges.b.to} ET. {result.overlap} trades occur in both cohorts.</p>
        <Table caption="Comparable trade metrics" headings={["Metric", "Cohort A", "Cohort B"]} rows={[
          ...[
            ["Closed trades", "count", "count"], ["Entry dates", "days", "count"], ["Net P&L", "net", "$"],
            ["Net expectancy", "expectancy", "$/trade"], ["Win rate", "winRate", "%"], ["Average planned R", "averageR", "r"],
            ["Original risk sample", "rSamples", "count"], ["Average hold", "hold", "min"]
          ].map(([label, key, unit]) => row(label, [result.a[key], result.b[key]], unit)),
          ...[
            ["Gross/net paired sample", "count", "count"], ["Gross expectancy on paired trades", "gross", "$/trade"],
            ["Net expectancy on paired trades", "net", "$/trade"]
          ].map(([label, key, unit]) => row(label, result.pairedGrossNet.map((item) => item[key]), unit))
        ]} />
        <p className="text-sm text-mist">Comparisons are descriptive. Different time periods, setups, and market conditions can change the trade mix.</p>
      </div>}
      <details><summary className="cursor-pointer text-sm">Actual versus saved simulation for the workspace dates</summary>
        <div className="mt-2"><SimulationSummary simulation={simulation} /></div>
      </details>
    </section>
  );
}
