import { useEffect, useRef, useState } from "react";
import EntryGradeFields from "./EntryGradeFields";
import { TradeLabelPickers, classificationDraft, classificationReady } from "./TradeClassificationFields";

const tradesLabel = (count) => `${count} ${count === 1 ? "trade" : "trades"}`;

export default function BulkTradeEditor({ trades, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => classificationDraft());
  const [modes, setModes] = useState({ setups: "append", tags: "append" });
  const [replaceManual, setReplaceManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = trades.length;
  const blind = trades.filter((trade) => trade.entryReview?.source === "BLIND").length;
  const manual = trades.filter((trade) => trade.entryReview?.source === "MANUAL").length;
  const gradeCount = count - blind - (replaceManual ? 0 : manual);
  const changes = {};
  for (const field of ["setups", "tags"]) {
    if (modes[field] === "clear" || draft[field].length) {
      const values = modes[field] === "clear" ? [] : draft[field];
      changes[field] = field === "tags" ? values.join(", ") : values;
      changes[`${field}Mode`] = modes[field] === "append" ? "append" : "replace";
    }
  }
  if (draft.grade && gradeCount > 0) {
    changes.entryGrade = { letterGrade: draft.grade };
    changes.gradeMode = replaceManual ? "replaceManual" : "ungraded";
  }
  const hasChanges = Object.keys(changes).length > 0;
  const actionSummary = ["setups", "tags"].filter((field) => changes[field] !== undefined).map((field) => {
    if (modes[field] === "clear") return `Clear all ${field}`;
    const noun = draft[field].length === 1 ? field.slice(0, -1) : field;
    return modes[field] === "replace" ? `Replace ${field} with ${draft[field].length} selected` : `Add ${draft[field].length} ${noun}`;
  });
  if (changes.entryGrade) actionSummary.push(`Apply ${draft.grade} to ${tradesLabel(gradeCount)}`);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!count || !hasChanges || busy || !classificationReady(draft)) return;
    setBusy(true);
    setError("");
    try {
      await onSave({ ...changes, tradeIds: trades.map(({ id }) => id) });
      onClose();
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby="bulk-trade-editor-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-lg border border-white/15 bg-[#111] p-0 text-white backdrop:bg-black/70">
    <form onSubmit={submit}>
      <header className="border-b border-white/10 px-4 py-4 sm:px-6">
        <h2 id="bulk-trade-editor-title" className="text-lg font-semibold">Edit {tradesLabel(count)}</h2>
        <p className="mt-1 text-sm text-mist">Choose the labels and grade to apply to your selection.</p>
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <TradeLabelPickers draft={draft} onChange={setDraft} busy={busy} modes={modes}
          onModeChange={(field, mode) => setModes((current) => ({ ...current, [field]: mode }))} />
        <section className="space-y-2 border-t border-white/10 pt-4" aria-label="Bulk grade">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <EntryGradeFields value={draft.grade} busy={busy || blind === count}
              onChange={(grade) => setDraft((current) => ({ ...current, grade }))} />
            {draft.grade && <button type="button" className="ui-button min-h-11 px-3 text-sm" disabled={busy}
              onClick={() => setDraft((current) => ({ ...current, grade: null }))}>Clear grade selection</button>}
          </div>
          {manual > 0 && <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" disabled={busy} checked={replaceManual}
              onChange={(event) => setReplaceManual(event.target.checked)} /> Replace existing manual grades
          </label>}
          <p className="text-sm text-mist">{`${tradesLabel(gradeCount)} can receive a grade.`}
            {blind > 0 && ` ${blind} blind ${blind === 1 ? "grade stays" : "grades stay"} locked.`}</p>
        </section>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      </div>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#111] px-4 py-3 sm:px-6">
        <p className="w-full min-w-0 text-sm text-mist sm:w-auto sm:flex-1" aria-live="polite">
          {actionSummary.length ? actionSummary.join(" · ") : "No changes selected."}
        </p>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="ui-button min-h-11 px-3 text-sm" disabled={busy}>Cancel</button>
          <button type="submit" className="ui-button-solid min-h-11 px-3 text-sm disabled:opacity-50"
            disabled={busy || !count || !hasChanges}>{busy ? "Applying…" : "Apply changes"}</button>
        </div>
      </footer>
    </form>
  </dialog>;
}
