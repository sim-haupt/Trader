import { Link } from "react-router-dom";
import { formatCurrency } from "../../utils/formatters";

export const categoryLabels = {
  performance: "Performance", setup: "Setups", time: "Timing", market: "Market", execution: "Execution",
  costs: "Costs", risk: "Risk", behavior: "Discipline", simulation: "Simulation"
};
export const widgetLabels = { performance: "Performance metrics", insights: "Recent signals", context: "Setup, window and risk context", simulation: "Saved what-if" };
export const reportLabels = { daily: "Daily summary", weekly: "Weekly review", monthly: "Monthly report", strategy: "Strategy report",
  risk: "Risk review", behavior: "Behavior report", execution: "Execution report", trend: "Performance trends" };
export const goalLabels = {
  outsideWindow: ["Entries outside target window", "%", "atMost"],
  riskCompliance: ["Rule compliance on assessable entries", "%", "atLeast"],
  commissionDrag: ["Recorded cost drag", "%", "atMost"],
  executionSpread: ["Average entry spread", "$/share", "atMost"],
  executionConsistency: ["Entry efficiency variability", "pp", "atMost"],
  impulsive: ["Impulsive trades among behavior-tagged trades", "%", "atMost"],
  discipline: ["Discipline score", "%", "atLeast"],
  customRule: ["Selected rule adherence", "%", "atLeast"],
  netExpectancy: ["Net expectancy", "$/trade", "atLeast"]
};

export function metric(value, unit = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit.startsWith("$")) return formatCurrency(value) + unit.slice(1);
  if (unit === "count") return value.toLocaleString();
  if (unit === "coefficient") return value.toFixed(3);
  if (unit === "p value") return value < .001 ? "<0.001" : value.toFixed(3);
  if (unit === "r") return `${value.toFixed(2)} R`;
  return `${Number(value.toFixed(1))}${unit === "%" || unit === "pp" ? unit : unit ? ` ${unit}` : ""}`;
}

export function DateCaption({ ranges }) {
  return <p className="text-sm text-mist">
    {ranges.current.from} to {ranges.current.to} ET · compared with {ranges.previous.from} to {ranges.previous.to}
  </p>;
}

export function EvidenceCard({ item, onDismiss, onGoal }) {
  return (
    <article className="rounded-md border border-[var(--line)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-mist">{item.type === "hypothetical" ? "Hypothetical" : categoryLabels[item.category]} · {item.assessment}</p>
        </div>
        {item.fingerprint && onDismiss && <button type="button" className="ui-button min-h-11 px-3 text-sm"
          onClick={() => onDismiss(item.fingerprint)} aria-label={`Dismiss ${item.title}`}>Dismiss</button>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {item.facts.map(({ label, value, unit, n }) => (
          <div key={label}><dt className="text-sm text-mist">{label}</dt>
            <dd className="mt-1 tabular-nums">{metric(value, unit)}{n != null && <span className="ml-2 text-xs text-mist">n={n}</span>}</dd></div>
        ))}
      </dl>
      {(item.trades.length > 0 || (onGoal && item.goalMetric)) &&
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--accent)]">
          {item.trades.map((trade) => <Link key={trade.id} className="inline-flex min-h-11 items-center hover:underline"
            to={`/trades/${trade.id}`}>{trade.symbol} · {trade.day}</Link>)}
          {onGoal && item.goalMetric && <button type="button" className="min-h-11 hover:underline" onClick={() => onGoal(item)}>Track a goal</button>}
        </div>}
    </article>
  );
}

export function SimulationSummary({ simulation }) {
  if (!simulation) return <p className="text-sm text-mist">Run or save a supported what-if in <Link to="/reports?view=risk" className="text-[var(--accent)]">Risk &amp; simulation</Link> to compare results here.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-mist">Hypothetical · {simulation.mode}{simulation.maxTrades ? ` · up to ${simulation.maxTrades} entries per session` : ""}</p>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          ["Actual filtered", simulation.actual, simulation.actualCount],
          ["Actual eligible", simulation.comparable, simulation.comparableCount],
          ["Hypothetical", simulation.hypothetical, simulation.hypotheticalCount]
        ].map(([label, value, count]) => <div key={label}>
          <p className="text-mist">{label}</p><p className="mt-1 tabular-nums">{metric(value, "$")} · {count} trades</p>
        </div>)}
      </div>
      <p className="text-sm text-mist">Simulated max drawdown {metric(simulation.drawdown, "$")}. These results depend on scenario assumptions.</p>
    </div>
  );
}

export default function IntelligenceOverview({ data, onDismiss, onGoal, full = false }) {
  const { ranges, summary, prior, risk, settings, insights, evidence, simulation } = data;
  const widgets = settings.widgets;
  const nextInsights = insights.slice(0, full ? 8 : 2);
  return (
    <section className="analysis-panel space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Trading intelligence</h2><DateCaption ranges={ranges} /></div>
        {!full && <Link to="/reports?view=intelligence" className="ui-button min-h-11 px-3 py-2 text-sm">Open intelligence</Link>}
      </header>
      {!widgets.length && <p className="text-sm text-mist">No dashboard widgets selected. Change this in Intelligence settings.</p>}
      {widgets.includes("performance") &&
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Net P&L", metric(summary.net, "$"), prior.count ? `Prior ${metric(prior.net, "$")}` : ""],
            ["Net expectancy", metric(summary.expectancy, "$/trade"), `${summary.count} closed trades · ${summary.days} dates`],
            ["Average planned R", metric(summary.averageR, "r"), `${summary.rSamples} trades with original risk`],
            ["Current drawdown", metric(risk.drawdown, "$"), "Selected period · closed results"]
          ].map(([label, value, detail]) => <div key={label}>
            <dt className="text-sm text-mist">{label}</dt><dd className="mt-1 text-xl font-medium tabular-nums">{value}</dd>
            {detail && <p className="mt-1 text-xs text-mist">{detail}</p>}
          </div>)}
        </dl>}
      {widgets.includes("insights") && <div className="space-y-2">
        {nextInsights.length ? nextInsights.map((item) => <EvidenceCard key={item.id} item={item} onDismiss={onDismiss} onGoal={onGoal} />)
          : <p className="text-sm text-mist">No enabled signals cleared the evidence thresholds for this period.</p>}
      </div>}
      {widgets.includes("insights") && data.aiReview && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Latest saved AI review · {data.aiReview.from} to {data.aiReview.to} ET</summary>
          <div className="mt-2"><EvidenceCard item={data.aiReview.evidence} onGoal={onGoal} /></div>
        </details>
      )}
      {widgets.includes("context") && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Setup, timing, market, and execution context</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-mist">Known new risk</p><p>{metric(risk.newRisk, "$")} · {risk.coverage} covered</p></div>
            <div><p className="text-mist">Discipline</p><p>{metric(risk.discipline, "%")} · {risk.checks} checks</p></div>
            <div><p className="text-mist">Entry efficiency</p><p>{metric(summary.entryEfficiency, "%")}</p></div>
            <div><p className="text-mist">Exit efficiency</p><p>{metric(summary.exitEfficiency, "%")}</p></div>
          </div>
          <div className="mt-3 space-y-2">
            {evidence.filter((row) => ["setup-best", "time-best", "capture"].includes(row.id) || row.category === "market")
              .slice(0, full ? 6 : 4).map((item) => <EvidenceCard key={item.id} item={item} onGoal={onGoal} />)}
          </div>
        </details>
      )}
      {widgets.includes("simulation") && <details><summary className="mb-2 cursor-pointer text-sm font-medium">Saved scenario comparison</summary>
        <SimulationSummary simulation={simulation} />
      </details>}
    </section>
  );
}
