import { useEffect, useState } from "react";
import FormField from "./ui/FormField";
import { formatDateTimeLocal } from "../utils/formatters";

const initialState = {
  symbol: "",
  side: "LONG",
  quantity: "",
  entryPrice: "",
  exitPrice: "",
  entryDate: "",
  exitDate: "",
  fees: "",
  strategy: "",
  notes: ""
};

function mapTradeToForm(trade) {
  if (!trade) {
    return initialState;
  }

  return {
    symbol: trade.symbol || "",
    side: trade.side || "LONG",
    quantity: trade.quantity ?? "",
    entryPrice: trade.entryPrice ?? "",
    exitPrice: trade.exitPrice ?? "",
    entryDate: formatDateTimeLocal(trade.entryDate),
    exitDate: formatDateTimeLocal(trade.exitDate),
    fees: trade.fees ?? "",
    strategy: trade.strategy ?? "",
    notes: trade.notes ?? ""
  };
}

function TradeForm({ trade, onSubmit, onCancel, isSubmitting }) {
  const [form, setForm] = useState(initialState);

  useEffect(() => {
    setForm(mapTradeToForm(trade));
  }, [trade]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSubmit({
      ...form,
      quantity: Number(form.quantity),
      entryPrice: Number(form.entryPrice),
      exitPrice: form.exitPrice ? Number(form.exitPrice) : null,
      fees: form.fees ? Number(form.fees) : 0,
      entryDate: new Date(form.entryDate).toISOString(),
      exitDate: form.exitDate ? new Date(form.exitDate).toISOString() : null
    });
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
      <FormField label="Symbol">
        <input
          name="symbol"
          value={form.symbol}
          onChange={handleChange}
          required
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Side">
        <select
          name="side"
          value={form.side}
          onChange={handleChange}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        >
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
        </select>
      </FormField>

      <FormField label="Quantity">
        <input
          name="quantity"
          type="number"
          step="0.0001"
          min="0"
          value={form.quantity}
          onChange={handleChange}
          required
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Entry Price">
        <input
          name="entryPrice"
          type="number"
          step="0.0001"
          min="0"
          value={form.entryPrice}
          onChange={handleChange}
          required
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Exit Price">
        <input
          name="exitPrice"
          type="number"
          step="0.0001"
          min="0"
          value={form.exitPrice}
          onChange={handleChange}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Fees">
        <input
          name="fees"
          type="number"
          step="0.0001"
          min="0"
          value={form.fees}
          onChange={handleChange}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Entry Date">
        <input
          name="entryDate"
          type="datetime-local"
          value={form.entryDate}
          onChange={handleChange}
          required
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <FormField label="Exit Date">
        <input
          name="exitDate"
          type="datetime-local"
          value={form.exitDate}
          onChange={handleChange}
          className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="Strategy">
          <input
            name="strategy"
            value={form.strategy}
            onChange={handleChange}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
          />
        </FormField>
      </div>

      <div className="md:col-span-2">
        <FormField label="Notes">
          <textarea
            name="notes"
            rows="4"
            value={form.notes}
            onChange={handleChange}
            className="w-full rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition focus:border-mint"
          />
        </FormField>
      </div>

      <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
        {trade && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:border-white/30"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-mint px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#8df6d2] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting ? "Saving..." : trade ? "Update Trade" : "Create Trade"}
        </button>
      </div>
    </form>
  );
}

export default TradeForm;
