import { useEffect, useState } from "react";
import intelligenceService from "../../services/intelligenceService";
import { getMarketDayKey } from "../../utils/advancedAnalytics";
import IntelligenceOverview, { categoryLabels, DateCaption, EvidenceCard, reportLabels, widgetLabels } from "./IntelligenceOverview";
import IntelligenceCompare from "./IntelligenceCompare";
import IntelligenceGoals from "./IntelligenceGoals";
import IntelligenceReports from "./IntelligenceReports";

const EMPTY_FILTER = {};
const views = { overview: "Overview", coach: "Coach", reports: "Reports", compare: "Compare", goals: "Goals", settings: "Settings" };
const starters = [
  "What are my most profitable setups?", "Which entry windows should I investigate?",
  "How much do commissions reduce my profits?", "Do I perform worse after consecutive losses?",
  "How does this month compare with previous months?"
];

function Coach({ range, aiAvailable, onGoal }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [cap, setCap] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(event) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const answer = await intelligenceService.ask({ question, range, tradeCap: cap ? Number(cap) : undefined, useAI });
      setAsked(question);
      setResult(answer);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="analysis-panel space-y-4">
      <h2 className="text-lg font-semibold">Trading coach</h2>
      <div className="flex flex-wrap gap-2">{starters.map((text) => <button key={text} type="button"
        className="ui-button min-h-11 px-3 text-left text-sm" onClick={() => setQuestion(text)}>{text}</button>)}</div>
      <form className="space-y-3" onSubmit={run}>
        <label className="analysis-field">Question
          <textarea minLength={4} maxLength={1200} required rows={3} value={question}
            onChange={(event) => setQuestion(event.target.value)} placeholder="What would happen if I limited myself to three entries per day?" />
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <label className="analysis-field">What-if daily entry cap (optional)
            <input type="number" min={1} max={1000} value={cap} onChange={(event) => setCap(event.target.value)} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={useAI} disabled={!aiAvailable} onChange={(event) => setUseAI(event.target.checked)} />
            Use AI evidence selection
          </label>
          <button className="ui-button-solid min-h-11 px-4" disabled={busy}>{busy ? "Reviewing evidence…" : "Ask coach"}</button>
        </div>
      </form>
      <p className="text-sm text-mist">
        {aiAvailable ? "Opting in sends your question and aggregate metrics to OpenAI for evidence selection." : "AI is unconfigured. The coach can still find evidence using built-in question topics."}
      </p>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      {result && <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <h3 className="font-semibold">{asked}</h3>
        <DateCaption ranges={result.ranges} />
        <p className="text-sm text-mist">{result.source === "ai" ? "AI prioritized these verified metrics." : "Verified evidence selected by topic."}</p>
        {result.notice && <p role="status" className="text-sm text-mist">{result.notice}</p>}
        {result.evidence.length ? result.evidence.map((item) => <EvidenceCard key={item.id} item={item} onGoal={onGoal} />)
          : <p className="text-sm text-mist">The selected history does not support this question. Try another date range or a question about recorded metrics.</p>}
        {result.actions.length > 0 && <div><h3 className="font-semibold">What to review next</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">{result.actions.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}
      </div>}
    </section>
  );
}

function Settings({ settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  function toggle(key, selected) {
    setDraft((current) => ({ ...current, [key]: current[key].includes(selected)
      ? current[key].filter((value) => value !== selected) : [...current[key], selected] }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const refreshed = await intelligenceService.saveProfile(draft);
      setDraft(refreshed);
      onSave(refreshed);
      setNotice("Intelligence settings saved.");
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  return (
    <form className="analysis-panel space-y-4" onSubmit={save}>
      <h2 className="text-lg font-semibold">Intelligence settings</h2>
      {[
        ["categories", "Insight categories", categoryLabels], ["widgets", "Dashboard sections", widgetLabels],
        ["cadences", "Automatic reports", { daily: reportLabels.daily, weekly: reportLabels.weekly, monthly: reportLabels.monthly }]
      ].map(([key, title, labels]) => (
        <fieldset className="flex flex-wrap gap-x-5" key={key}>
          <legend className="font-medium">{title}</legend>
          {Object.entries(labels).map(([id, label]) => <label key={id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={draft[key].includes(id)} onChange={() => toggle(key, id)} />{label}
          </label>)}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-end gap-4">
        <label className="analysis-field">Generate at (ET)
          <select value={draft.hour} onChange={(event) => setDraft((current) => ({ ...current, hour: Number(event.target.value) }))}>
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.scheduledAI} disabled={!settings.aiAvailable}
            onChange={(event) => setDraft((current) => ({ ...current, scheduledAI: event.target.checked }))} />
          Send aggregate evidence to AI for scheduled reviews
        </label>
        <button className="ui-button-solid min-h-11 px-4" disabled={busy}>Save intelligence settings</button>
      </div>
      <p className="text-sm text-mist">A running Trader server checks schedules and saves completed-period reports in this account. Scheduled goals are sampled during the same run.</p>
      {settings.nextRunAt && <p className="text-sm text-mist">
        Next scheduled check {new Date(settings.nextRunAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
      </p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
  );
}

export default function IntelligenceWorkspace({ initialRange, filters = EMPTY_FILTER }) {
  const [view, setView] = useState("overview");
  const [range, setRange] = useState(initialRange);
  const [draft, setDraft] = useState(initialRange);
  const [data, setData] = useState(null);
  const [seed, setSeed] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    intelligenceService.overview(range ? { ...range, ...filters } : undefined).then((response) => {
      if (!active) return;
      setData(response);
      setDraft((value) => value || response.ranges.current);
    }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [range, revision, filters]);

  function goal(item) { setSeed(item); setView("goals"); }
  async function dismiss(fingerprint) {
    setError("");
    try {
      await intelligenceService.dismiss(fingerprint);
      setData((current) => ({ ...current, insights: current.insights.filter((item) => item.fingerprint !== fingerprint) }));
    } catch (error) { setError(error.message); }
  }

  const requestRange = data ? { ...data.ranges.current, ...filters } : null;
  return (
    <div className="space-y-4">
      <div className="analysis-panel">
        <nav className="analysis-tabs" aria-label="Trading intelligence views">
          {Object.entries(views).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id}
            onClick={() => setView(id)}>{label}</button>)}
        </nav>
        {draft && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          setRange({ ...draft });
        }}>
          {["from", "to"].map((key) => <label className="analysis-field" key={key}>{key === "from" ? "Evidence from (ET)" : "Evidence to (ET)"}
            <input type="date" required value={draft[key]} onChange={(event) => setDraft((value) => ({ ...value, [key]: event.target.value }))} />
          </label>)}
          <button className="ui-button min-h-11 px-3">Apply dates</button>
        </form>}
        {Object.keys(filters).length > 0 && <p className="mt-3 text-xs text-mist">Reports scope · {Object.values(filters).join(" · ")}</p>}
      </div>
      {error && <p role="alert" className="analysis-panel text-sm text-coral">{error} <button type="button" className="underline"
        onClick={() => setRevision((i) => i + 1)}>Retry</button></p>}
      {!data && !error && <p role="status" className="analysis-panel text-sm text-mist">Loading trading intelligence…</p>}
      {data && <>
        {view === "overview" && <IntelligenceOverview full data={data} onDismiss={dismiss} onGoal={goal} />}
        {view === "coach" && <Coach range={requestRange} aiAvailable={data.settings.aiAvailable} onGoal={goal} />}
        {view === "reports" && <IntelligenceReports range={requestRange} aiAvailable={data.settings.aiAvailable} onGoal={goal} />}
        {view === "compare" && <IntelligenceCompare key={JSON.stringify(data.ranges)} ranges={data.ranges} simulation={data.simulation} />}
        {view === "goals" && <IntelligenceGoals key={seed?.id || "manual"} seed={seed} today={getMarketDayKey(new Date())} setup={filters.setup} />}
        {view === "settings" && <Settings settings={data.settings} onSave={(settings) => {
          setData((current) => ({ ...current, settings }));
          setRevision((i) => i + 1);
        }} />}
      </>}
    </div>
  );
}
