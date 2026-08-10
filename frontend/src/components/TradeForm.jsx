import { useEffect, useMemo, useState } from "react";
import FormField from "./ui/FormField";
import RichTextEditor from "./ui/RichTextEditor";
import { formatDateTimeLocal, toMarketISOString } from "../utils/formatters";
import tagService from "../services/tagService";
import setupService from "../services/setupService";

const initialState = {
  symbol: "",
  side: "LONG",
  quantity: "",
  entryPrice: "",
  exitPrice: "",
  entryDate: "",
  exitDate: "",
  commissions: "",
  fees: "",
  setup: "",
  tags: "",
  notes: ""
};

function formatCommissionInputValue(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  return String(Math.round(numericValue * 100) / 100);
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ui-chip-remove-icon h-3.5 w-3.5">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
    commissions: formatCommissionInputValue(trade.commissions),
    fees: trade.fees ?? "",
    setup: trade.setup ?? "",
    tags: trade.tags ?? "",
    notes: trade.notes ?? ""
  };
}

function TradeForm({ trade, onSubmit, onCancel, isSubmitting }) {
  const [form, setForm] = useState(initialState);
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);
  const [availableSetups, setAvailableSetups] = useState(
    () => setupService.peekSetups() || []
  );

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

  useEffect(() => {
    let cancelled = false;

    async function loadSetups() {
      try {
        const setups = await setupService.getSetups();

        if (!cancelled) {
          setAvailableSetups(setups);
        }
      } catch {
        if (!cancelled) {
          setAvailableSetups([]);
        }
      }
    }

    loadSetups();

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

  const selectedSetup = useMemo(() => String(form.setup || "").trim(), [form.setup]);

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

  function handleSelectSetup(setupName) {
    setForm((current) => ({
      ...current,
      setup: setupName
    }));
  }

  function handleRemoveSetup() {
    setForm((current) => ({
      ...current,
      setup: ""
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSubmit({
      ...form,
      quantity: Number(form.quantity),
      entryPrice: Number(form.entryPrice),
      exitPrice: form.exitPrice ? Number(form.exitPrice) : null,
      commissions: form.commissions ? Number(Number(form.commissions).toFixed(2)) : 0,
      fees: form.fees ? Number(form.fees) : 0,
      entryDate: toMarketISOString(form.entryDate),
      exitDate: form.exitDate ? toMarketISOString(form.exitDate) : null
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

      <FormField label="Entry Date">
        <input
          name="entryDate"
          type="datetime-local"
          step="1"
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
          step="1"
          value={form.exitDate}
          onChange={handleChange}
          className="ui-input"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="Setup">
          <div className="space-y-2">
            {availableSetups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availableSetups.map((setup) => {
                  const selected = setup.name === selectedSetup;

                  return (
                    <button
                      key={setup.id}
                      type="button"
                      onClick={() => (selected ? handleRemoveSetup() : handleSelectSetup(setup.name))}
                      className="ui-chip-removable ui-setup-pill"
                      data-active={selected}
                    >
                      <span>{setup.name}</span>
                      {selected && <RemoveIcon />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-white/48">
                No saved setups available. Add them from Settings.
              </div>
            )}
            {selectedSetup && (
              <button type="button" onClick={handleRemoveSetup} className="text-xs font-medium text-white/56 transition hover:text-white">
                Clear setup
              </button>
            )}
          </div>
        </FormField>
      </div>

      <div className="md:col-span-2">
        <FormField label="Tags">
          <div className="space-y-2">
            {availableTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const selected = selectedTags.some(
                    (selectedTag) => selectedTag.toLowerCase() === tag.name.toLowerCase()
                  );

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => (selected ? handleRemoveTag(tag.name) : handleAddTag(tag.name))}
                      className="ui-chip-removable"
                      data-active={selected}
                    >
                      <span>{tag.name}</span>
                      {selected && <RemoveIcon />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-white/48">
                No saved tags available. Add them from Settings.
              </div>
            )}
            {selectedTags.length > 0 && (
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, tags: "" }))}
                className="text-xs font-medium text-white/56 transition hover:text-white"
              >
                Clear tags
              </button>
            )}
          </div>
        </FormField>
      </div>

      <div className="md:col-span-2">
        <FormField label="Notes">
          <RichTextEditor
            value={form.notes}
            onChange={(value) => setForm((current) => ({ ...current, notes: value }))}
            placeholder="Capture setup, context, and review notes for this trade."
            minHeight={180}
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
