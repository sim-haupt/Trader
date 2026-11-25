import { useId } from "react";
import { formatCurrency } from "../utils/formatters";

const criteria = [
  ["setupFit", "Setup fit"],
  ["timing", "Trigger and timing"],
  ["invalidation", "Clear invalidation"],
  ["liquidity", "Liquidity at entry"]
];
const planFields = [
  ["plannedStop", "Original stop price"],
  ["plannedInitialRisk", "Original planned risk ($)"],
  ["intendedPrice", "Intended entry price"]
];

export function entryGradeTotal(grade) {
  return criteria.reduce((sum, [key]) => sum + (grade?.[key] ?? 0), 0);
}

export function isEntryGradeReady(grade) {
  return grade && criteria.every(([key]) => grade[key] !== undefined)
    && typeof grade.wouldRetake === "boolean" && Boolean(grade.notes?.trim());
}

export function entryGradePayload(grade) {
  return {
    ...Object.fromEntries(criteria.map(([key]) => [key, grade[key]])),
    wouldRetake: grade.wouldRetake,
    notes: grade.notes.trim(),
    ...Object.fromEntries(planFields.map(([key]) => [key, grade[key] ? Number(grade[key]) : null]))
  };
}

export function SavedEntryGrade({ review }) {
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span>{review.source === "MANUAL" ? "Manual entry grade" : "Blind entry grade"}</span>
      <strong className="tabular-nums">{entryGradeTotal(review)}/8</strong>
    </div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-mist">
      {criteria.map(([key, label]) => <div className="flex justify-between gap-2" key={key}>
        <dt>{label}</dt><dd className="tabular-nums">{review[key]}/2</dd>
      </div>)}
    </dl>
    <p>Would take again · {review.wouldRetake ? "Yes" : "No"}</p>
    <p className="whitespace-pre-wrap break-words text-mist">{review.notes}</p>
    {planFields.map(([key, label]) => review[key] != null && <p key={key}>{label} · {formatCurrency(Number(review[key]))}</p>)}
  </div>;
}

export default function EntryGradeFields({ value, onChange, busy }) {
  const id = useId();
  const set = (key, next) => onChange({ ...value, [key]: next });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-mist">0 Poor · 1 Mixed · 2 Strong</p>
      <strong className="tabular-nums" aria-label="Entry grade score">{entryGradeTotal(value)}/8</strong>
    </div>
    {criteria.map(([key, label]) => <fieldset key={key} className="flex items-center justify-between gap-2" disabled={busy}>
      <legend className="sr-only">{label}</legend>
      <span className="text-sm" aria-hidden="true">{label}</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((score) => <label key={score} className="cursor-pointer">
          <input type="radio" required name={`${id}-${key}`} value={score} className="peer sr-only"
            checked={value[key] === score} onChange={() => set(key, score)} />
          <span className="inline-flex h-11 w-11 items-center justify-center rounded border border-white/15 text-sm text-mist peer-checked:border-white/70 peer-checked:bg-white/10 peer-checked:text-white peer-focus-visible:outline">{score}</span>
        </label>)}
      </div>
    </fieldset>)}
    <label className="analysis-field">Would you take it again?
      <select required disabled={busy} value={value.wouldRetake == null ? "" : value.wouldRetake ? "yes" : "no"}
        onChange={(event) => set("wouldRetake", event.target.value ? event.target.value === "yes" : undefined)}>
        <option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </label>
    <label className="analysis-field">What did you see?
      <textarea required disabled={busy} maxLength={4000} rows={2} value={value.notes ?? ""}
        onChange={(event) => set("notes", event.target.value)} />
    </label>
    <details className="text-sm">
      <summary className="cursor-pointer text-mist">Original trade plan (optional)</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {planFields.map(([key, label]) => <label key={key} className="analysis-field">{label}
          <input type="number" min="0.0001" max="1000000000" step="0.0001" disabled={busy}
            value={value[key] ?? ""} onChange={(event) => set(key, event.target.value)} />
        </label>)}
      </div>
    </details>
  </div>;
}
