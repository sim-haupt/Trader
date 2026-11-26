import { useId } from "react";
import { formatCurrency } from "../utils/formatters";
import { ENTRY_GRADES } from "../utils/entryGrades";

const planFields = [
  ["plannedStop", "Original stop price"],
  ["plannedInitialRisk", "Original planned risk ($)"],
  ["intendedPrice", "Intended entry price"]
];

export function entryPlanPayload(plan) {
  return Object.fromEntries(planFields.filter(([key]) => plan[key]).map(([key]) => [key, Number(plan[key])]));
}

export function SavedEntryGrade({ review }) {
  return <div className="space-y-2 text-sm">
    <div className="flex flex-wrap items-baseline gap-2">
      <span>{review.source === "MANUAL" ? "Manual entry grade" : "Blind entry grade"}</span>
      <strong className="rounded border border-white/15 px-2 py-0.5">{review.letterGrade}</strong>
    </div>
    {review.notes && <p className="whitespace-pre-wrap break-words text-mist">{review.notes}</p>}
    {planFields.map(([key, label]) => review[key] != null && <p key={key}>{label} · {formatCurrency(Number(review[key]))}</p>)}
  </div>;
}

export function EntryPlanFields({ value, onChange, busy }) {
  return <details className="text-sm">
    <summary className="cursor-pointer text-mist">Original trade plan (optional)</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {planFields.map(([key, label]) => <label key={key} className="analysis-field">{label}
        <input type="number" min="0.0001" max="1000000000" step="0.0001" disabled={busy} value={value[key] ?? ""}
          onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
      </label>)}
    </div>
  </details>;
}

export default function EntryGradeFields({ value, onChange, busy, label = "Entry grade", required = false }) {
  const id = useId();
  return <fieldset disabled={busy}>
    <legend className="mb-2 text-sm font-medium">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {ENTRY_GRADES.map((grade) => <label key={grade} className="cursor-pointer">
        <input type="radio" name={id} value={grade} required={required} checked={value === grade}
          onChange={() => onChange(grade)} className="peer sr-only" />
        <span className="inline-flex h-11 w-12 items-center justify-center rounded border border-white/15 text-sm font-medium text-mist peer-checked:border-white/70 peer-checked:bg-white/10 peer-checked:text-white peer-focus-visible:outline">{grade}</span>
      </label>)}
    </div>
  </fieldset>;
}
