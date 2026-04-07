import { useEffect, useMemo, useState } from "react";
import FormField from "./ui/FormField";
import { formatDateTimeLocal } from "../utils/formatters";
import tagService from "../services/tagService";

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
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);

  useEffect(() => {
    setForm(mapTradeToForm(trade));
  }, [trade]);

  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        const tags = await tagService.getTags();

        if (!cancelled) {
          setAvailableTags(tags);
        }
      } catch {
        if (!cancelled) {
          setAvailableTags([]);
        }
      }
    }

    loadTags();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  const selectedTags = useMemo(
    () =>
      String(form.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [form.tags]
  );

  const selectableTags = useMemo(() => {
    const active = new Set(selectedTags.map((tag) => tag.toLowerCase()));

    return availableTags.filter((tag) => !active.has(tag.name.toLowerCase()));
  }, [availableTags, selectedTags]);

  function handleAddTag(tagName) {
    setForm((current) => {
      const currentTags = String(current.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      return {
        ...current,
        tags: [...new Set([...currentTags, tagName])].join(", ")
      };
    });
  }

  function handleRemoveTag(tagName) {
    setForm((current) => ({
      ...current,
      tags: String(current.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag && tag !== tagName)
        .join(", ")
    }));
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
          <div className="space-y-3">
            {selectedTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/82"
                  >
                    <span>{tag}</span>
                    <span className="text-white/48">x</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-[12px] border border-black/20 bg-white/[0.02] px-4 py-3 text-sm text-white/54">
                No tags selected
              </div>
            )}

            {selectableTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {selectableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleAddTag(tag.name)}
                    className="ui-button px-3 py-1.5 text-xs"
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs text-white/48">
                No saved tags available. Add them from Settings.
              </div>
            )}
          </div>
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
