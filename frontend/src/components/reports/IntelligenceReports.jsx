import { useEffect, useState } from "react";
import intelligenceService from "../../services/intelligenceService";
import { DateCaption, EvidenceCard, metric, reportLabels } from "./IntelligenceOverview";
import { Table } from "./PerformanceIntelligence";

export default function IntelligenceReports({ range, aiAvailable, onGoal }) {
  const [kind, setKind] = useState("weekly");
  const [setup, setSetup] = useState(range.setup || "");
  const [useAI, setUseAI] = useState(false);
  const [reports, setReports] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    intelligenceService.listReports().then((data) => { if (mounted) setReports(data); })
      .catch((error) => { if (mounted) setError(error.message); });
    return () => { mounted = false; };
  }, []);

  async function run(type, action) {
    setBusy(type);
    setError("");
    try { await action(); } catch (error) { setError(error.message); } finally { setBusy(""); }
  }

  async function generate(event) {
    event.preventDefault();
    return run("generate", async () => {
      const result = await intelligenceService.generate({
        kind, range: { ...range, ...(kind === "strategy" ? { setup: setup.trim() } : {}) }, useAI
      });
      setActive(result);
      setReports((current) => [result, ...current]);
    });
  }

  const data = active?.payload;
  return (
    <section className="analysis-panel space-y-4">
      <h2 className="text-lg font-semibold">Trading reports</h2>
      <form onSubmit={generate} className="flex flex-wrap items-end gap-3">
        <label className="analysis-field">Report type
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {Object.entries(reportLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        {kind === "strategy" && <label className="analysis-field">Setup name
          <input required value={setup} maxLength={120} onChange={(event) => setSetup(event.target.value)} />
        </label>}
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={useAI} disabled={!aiAvailable}
          onChange={(event) => setUseAI(event.target.checked)} />Use AI to prioritize the review</label>
        <button className="ui-button-solid min-h-11 px-4" disabled={Boolean(busy)}>{busy === "generate" ? "Generating…" : "Generate report"}</button>
      </form>
      <p className="text-sm text-mist">Daily, weekly and monthly reports use the period ending on the selected end date. Reports save the evidence as it was at generation. Schedule completed-period reviews from Settings.</p>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      {reports.length > 0 && (
        <label className="analysis-field max-w-sm">Saved reports
          <select value={active?.id || ""} disabled={Boolean(busy)} onChange={(event) => {
            const id = event.target.value;
            if (id) run("read", async () => setActive(await intelligenceService.report(id)));
            else setActive(null);
          }}>
            <option value="">Open a report</option>
            {reports.map((item) => <option key={item.id} value={item.id}>`${reportLabels[item.kind]} · ${item.fromDay} to ${item.toDay} · ${new Date(item.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" })} ET`</option>)}
          </select>
        </label>
      )}
      {data && <>
        <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--line)] pt-4">
          <div><h3 className="font-semibold">{reportLabels[active.kind]}</h3><DateCaption ranges={data.ranges} />
            <p className="text-sm text-mist">{data.source === "ai" ? "AI-prioritized verified evidence" : "Deterministic evidence review"}{data.scheduled && " · Scheduled"}</p>
          </div>
          <div className="flex flex-wrap gap-2">{["pdf", "xlsx", "csv"].map((format) => <button key={format} className="ui-button min-h-11 px-3"
            disabled={Boolean(busy)} type="button" onClick={() => run(format, () => intelligenceService.download(active, format))}>Export {format.toUpperCase()}</button>)}</div>
        </div>
        {data.notice && <p role="status" className="text-sm text-mist">{data.notice}</p>}
        {!!data.focus.length && <div className="space-y-2"><h3 className="font-semibold">Review first</h3>
          {data.focus.map((item) => <EvidenceCard key={item.id} item={item} onGoal={onGoal} />)}</div>}
        {data.trends.length > 0 && <Table caption="Recent monthly trends" headings={["Month", "Closed trades", "Net P&L", "Expectancy", "Win rate"]}
          rows={data.trends.map((row) => [row.label, row.count, metric(row.net, "$"), metric(row.expectancy, "$/trade"), metric(row.winRate, "%")])} />}
        {data.setups.length > 0 && <details><summary className="cursor-pointer text-sm">Setup and entry-window results</summary>
          {[["Setup", data.setups], ["Entry window", data.windows]].map(([name, rows]) => <Table key={name} caption={name}
            headings={[name, "Closed", "Sessions", "Net P&L", "Expectancy"]}
            rows={rows.map((row) => [row.label, row.count, row.days, metric(row.net, "$"), metric(row.expectancy, "$/trade")])} />)}
        </details>}
        {data.evidence.length > 0 ? <details><summary className="cursor-pointer text-sm">All evidence and trade references</summary>
          <div className="mt-2 space-y-2">{data.evidence.map((item) => <EvidenceCard key={item.id} item={item} onGoal={onGoal} />)}</div>
        </details> : <p className="text-sm text-mist">No measured evidence in the selected dates.</p>}
        <div><h3 className="font-semibold">Investigate next period</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">
          {data.recommendations.map((text) => <li key={text}>{text}</li>)}
        </ul></div>
      </>}
    </section>
  );
}
