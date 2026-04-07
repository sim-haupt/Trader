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
  tags: "",
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
    tags: trade.tags ?? "",
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
          className="ui-input"
        />
      </FormField>

      <FormField label="Side">
        <select
          name="side"
          value={form.side}
          onChange={handleChange}
          className="ui-input"
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
          className="ui-input"
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
          className="ui-input"
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
          className="ui-input"
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
          className="ui-input"
        />
      </FormField>

      <FormField label="Entry Date">
        <input
          name="entryDate"
          type="datetime-local"
          value={form.entryDate}
          onChange={handleChange}
          required
          className="ui-input"
        />
      </FormField>

      <FormField label="Exit Date">
        <input
          name="exitDate"
          type="datetime-local"
          value={form.exitDate}
          onChange={handleChange}
          className="ui-input"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="Strategy">
          <input
            name="strategy"
            value={form.strategy}
            onChange={handleChange}
            className="ui-input"
          />
        </FormField>
      </div>

      <div className="md:col-span-2">
        <FormField label="Tags">
          <input
            name="tags"
            value={form.tags}
            onChange={handleChange}
            placeholder="Breakout, A+, news, revenge"
            className="ui-input"
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
            className="ui-input"
          />
        </FormField>
      </div>

      <div className="md:col-span-2 flex flex-wrap justify-end gap-3">
        {trade && (
          <button
            type="button"
            onClick={onCancel}
            className="ui-button text-sm"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="ui-button-solid text-sm"
        >
          {isSubmitting ? "Saving..." : trade ? "Update Trade" : "Create Trade"}
        </button>
      </div>
    </form>
  );
}

export default TradeForm;
