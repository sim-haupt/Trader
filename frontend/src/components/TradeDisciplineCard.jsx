import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "./ui/Card";
import analysisService from "../services/analysisService";
import { clearTradeCaches } from "../services/tradeService";
import { BEHAVIOR_TAGS, RULE_FIELDS, summarizeDiscipline } from "../utils/riskAnalytics";
import { formatCurrency } from "../utils/formatters";

const defaults = { before: "", after: "", confidence: null, quality: null, setup: "unknown", entry: "unknown", exit: "unknown", tags: [], rules: [] };

function RuleSelect({ label, value, onChange }) {
  return <label className="analysis-field">{label}
    <select value={value ?? "unknown"} onChange={(event) => onChange(event.target.value)}>
      <option value="unknown">Unassessed</option><option value="followed">Followed</option><option value="violated">Violated</option>
    </select>
  </label>;
}

function CompleteRiskPlan({ trade, onPlanUpdate }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const fields = [["plannedStop", "Original stop price"], ["plannedInitialRisk", "Original dollar risk"]]
    .filter(([key]) => trade.entryReview?.[key] == null);
  if (!trade.entryReview || !fields.length) return notice ? <p className="mt-2 text-sm" role="status">{notice}</p> : null;

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const data = Object.fromEntries(fields.filter(([key]) => values[key]).map(([key]) => [key, Number(values[key])]));
      onPlanUpdate(await analysisService.saveOriginalRisk(trade.id, data));
      clearTradeCaches();
      setNotice("Original risk reference saved.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer">Add missing original risk references</summary>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={save}>
        {fields.map(([key, label]) => <label key={key} className="analysis-field">{label}
          <input type="number" min={0.0001} max={1_000_000_000} step={0.0001} value={values[key] ?? ""}
            onChange={(event) => setValues((state) => ({ ...state, [key]: event.target.value }))} />
        </label>)}
        <button className="ui-button min-h-11 px-3" disabled={saving || !fields.some(([key]) => values[key])}>Save original risk</button>
        {notice && <p role="status" className="w-full">{notice}</p>}
      </form>
    </details>
  );
}

export default function TradeDisciplineCard({ trade, onUpdate, onEditNotes, onPlanUpdate }) {
  const [draft, setDraft] = useState(() => ({ ...defaults, ...trade.analysis?.behavior }));
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const score = summarizeDiscipline(draft);

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    setProfileError("");
    analysisService.getRiskProfile().then((value) => { if (active) setProfile(value); })
      .catch((error) => { if (active) setProfileError(error.message); });
    return () => { active = false; };
  }, [editing]);

  const tags = [...new Set([...BEHAVIOR_TAGS, ...(profile?.tags || []), ...draft.tags])];
  const rules = new Map(draft.rules.map((rule) => [rule.id, rule]));
  for (const rule of profile?.rules || []) if (!rules.has(rule.id)) rules.set(rule.id, { ...rule, result: "unknown" });

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const analysis = await analysisService.saveBehavior(trade.id, { ...draft, rules: [...rules.values()].filter(({ result }) => result !== "unknown") });
      clearTradeCaches();
      onUpdate(analysis);
      setNotice("Trading observations saved.");
      setEditing(false);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Trading discipline" action={<div className="flex flex-wrap gap-2">
      <Link className="ui-button min-h-11 px-3 py-2 text-sm" to={`/trades/${trade.id}/replay`}>Replay trade</Link>
      <button type="button" className="ui-button min-h-11 px-3 text-sm" aria-expanded={editing}
        onClick={() => { if (!editing) setDraft({ ...defaults, ...trade.analysis?.behavior }); setEditing(!editing); }}>{editing ? "Close observations" : "Log observations"}</button>
    </div>}>
      <p className="text-sm text-mist">
        Discipline score {score.score == null ? "unrated" : `${score.score.toFixed(0)}% · ${score.followed} of ${score.checked} followed`}. Only assessed rules contribute.
        {trade.entryReview?.plannedInitialRisk != null && ` Planned initial risk ${formatCurrency(Number(trade.entryReview.plannedInitialRisk))}.`}
      </p>
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      <CompleteRiskPlan trade={trade} onPlanUpdate={onPlanUpdate} />
      {editing && (
        <form className="mt-4 space-y-4" onSubmit={save}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[["before", "Emotion before trade"], ["after", "Emotion after trade"]].map(([field, label]) => <label className="analysis-field" key={field}>{label}
              <input maxLength={60} list={`emotion-${trade.id}`} value={draft[field]} onChange={(event) => update(field, event.target.value)} />
            </label>)}
            <datalist id={`emotion-${trade.id}`}>{["Calm", "Focused", "Anxious", "Frustrated", "Excited", "Tired"].map((value) => <option key={value} value={value} />)}</datalist>
            {[["confidence", "Confidence"], ["quality", "Trade quality"]].map(([field, label]) => <label className="analysis-field" key={field}>{label}
              <select value={draft[field] ?? ""} onChange={(event) => update(field, event.target.value ? Number(event.target.value) : null)}>
                <option value="">Unrated</option>{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {RULE_FIELDS.map(([key, label]) => <RuleSelect key={key} label={label} value={draft[key]} onChange={(value) => update(key, value)} />)}
            {[...rules.values()].map((rule) => <RuleSelect key={rule.id} label={rule.label} value={rule.result}
              onChange={(result) => update("rules", [...rules.values()].map((item) => item.id === rule.id ? { ...item, result } : item))} />)}
          </div>
          {profileError && <p role="status" className="text-sm text-coral">Custom rules could not load. {profileError}</p>}
          <fieldset className="flex flex-wrap gap-x-4">
            <legend className="text-sm text-mist">Self-reported observations</legend>
            {tags.map((tag) => <label key={tag} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.tags.includes(tag)} onChange={(event) => update("tags",
                event.target.checked ? [...draft.tags, tag] : draft.tags.filter((value) => value !== tag))} />{tag}
            </label>)}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button className="ui-button-solid min-h-11 px-4" disabled={busy}>Save observations</button>
            <button type="button" className="ui-button min-h-11 px-3" onClick={onEditNotes}>Edit trade notes</button>
            <Link className="text-sm text-[var(--accent)]" to={`/trade-reviews/grade?trade=${trade.id}`}>Original entry plan</Link>
          </div>
        </form>
      )}
    </Card>
  );
}
