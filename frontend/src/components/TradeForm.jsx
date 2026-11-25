import { useState } from "react";
import FormField from "./ui/FormField";
import RichTextEditor from "./ui/RichTextEditor";
import TradeClassificationFields, { classificationDraft, classificationPayload, classificationReady } from "./TradeClassificationFields";
import { formatDateTimeLocal, toMarketISOString } from "../utils/formatters";

const fields = [
  ["symbol", "Symbol", "text", true],
  ["side", "Side", "select", true],
  ["quantity", "Quantity", "number", true],
  ["entryPrice", "Entry price", "number", true],
  ["entryDate", "Entry time (ET)", "datetime-local", true],
  ["exitPrice", "Exit price", "number"],
  ["exitDate", "Exit time (ET)", "datetime-local"]
];
const costFields = [["commissions", "Commissions", "number"], ["fees", "Fees", "number"]];

function financialDraft(trade) {
  return {
    symbol: trade?.symbol ?? "",
    side: trade?.side ?? "LONG",
    quantity: trade?.quantity ?? "",
    entryPrice: trade?.entryPrice ?? "",
    exitPrice: trade?.exitPrice ?? "",
    entryDate: trade?.entryDate ? formatDateTimeLocal(trade.entryDate) : "",
    exitDate: trade?.exitDate ? formatDateTimeLocal(trade.exitDate) : "",
    commissions: trade?.commissions ?? "",
    fees: trade?.fees ?? ""
  };
}

export default function TradeForm({ trade, onSubmit, onCancel, isSubmitting, error }) {
  const [form, setForm] = useState(() => financialDraft(trade));
  const [labels, setLabels] = useState(() => classificationDraft(trade));
  const [notes, setNotes] = useState(trade?.notes ?? "");
  const [invalid, setInvalid] = useState(false);

  function submit(event) {
    event.preventDefault();
    if (!classificationReady(labels)) {
      setInvalid(true);
      return;
    }
    if (isSubmitting) return;
    const currentLabels = classificationDraft(trade);
    const { setups, tags, tagsMode, entryGrade } = classificationPayload(labels);
    const metadata = {
      ...(JSON.stringify(currentLabels.setups) !== JSON.stringify(setups) && { setups }),
      ...(JSON.stringify(currentLabels.tags) !== JSON.stringify(labels.tags) && { tags, tagsMode }),
      ...(notes !== (trade?.notes ?? "") && { notes }),
      ...(entryGrade && { entryGrade })
    };

    const original = financialDraft(trade);
    if (trade && Object.keys(original).every((key) => String(original[key]) === String(form[key]))) {
      if (Object.keys(metadata).length) onSubmit(metadata, { metadataOnly: true });
      else onCancel();
      return;
    }

    onSubmit({
      ...form,
      quantity: Number(form.quantity),
      entryPrice: Number(form.entryPrice),
      exitPrice: form.exitPrice ? Number(form.exitPrice) : null,
      commissions: Number(form.commissions),
      fees: Number(form.fees),
      entryDate: toMarketISOString(form.entryDate),
      exitDate: form.exitDate ? toMarketISOString(form.exitDate) : null,
      ...metadata
    });
  }

  function renderField([key, label, type, required]) {
    const input = { name: key, value: form[key], required, className: "ui-input min-h-11",
      onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })) };
    return <div key={key} className={type === "datetime-local" || key === "exitPrice" ? "col-span-2 min-w-0 sm:col-span-1" : "min-w-0"}>
      <FormField label={label}>
      {type === "select" ? <select {...input}><option value="LONG">Long</option><option value="SHORT">Short</option></select>
        : <input {...input} type={type} step={type === "datetime-local" ? "1" : type === "number" ? "0.0001" : undefined}
          min={type === "number" ? (required ? "0.0001" : "0") : undefined} />}
      </FormField>
    </div>;
  }

  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid items-start gap-5 xl:grid-cols-2 xl:grid-rows-[auto_1fr]">
      <fieldset className="min-w-0 space-y-3" disabled={isSubmitting}>
        <legend className="mb-3 text-base font-semibold">Trade details</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4">{fields.map(renderField)}</div>
        <details className="text-sm">
          <summary className="cursor-pointer py-2 text-mist">Commissions and fees</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">{costFields.map(renderField)}</div>
        </details>
      </fieldset>
      <section className="min-w-0 space-y-3 border-t border-white/10 pt-4 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" aria-label="Trade classification">
        <h2 className="text-base font-semibold">Setups, tags and grade</h2>
        <TradeClassificationFields draft={labels} onChange={(next) => { setLabels(next); setInvalid(false); }}
          review={trade?.entryReview} busy={isSubmitting} />
      </section>
      <div className="min-w-0 border-t border-white/10 pt-4">
        <h2 className="mb-2 text-sm font-medium">Trade notes</h2>
        <RichTextEditor value={notes} onChange={setNotes} placeholder="Capture context and lessons for this trade." minHeight={140} />
      </div>
    </div>
    {(error || invalid) && <p role="alert" className="text-sm text-coral">{invalid ? "Check the selected labels and complete the entry grade before saving." : error}</p>}
    <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
      <button type="button" onClick={onCancel} disabled={isSubmitting} className="ui-button min-h-11 text-sm">Cancel</button>
      <button type="submit" disabled={isSubmitting} className="ui-button-solid min-h-11 text-sm">
        {isSubmitting ? "Saving…" : trade ? "Save changes" : "Create trade"}
      </button>
    </div>
  </form>;
}
