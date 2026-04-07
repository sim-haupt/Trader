import { useMemo, useState } from "react";
import { formatCurrency, formatDate, formatDateTimeLocal } from "../utils/formatters";

function createFormState(trade) {
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

function AdminTradeTable({
  trades,
  selectedIds,
  onToggleSelection,
  onToggleAll,
  onSave,
  onDelete,
  isSaving,
  isDeleting
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);

  const allSelected = useMemo(
    () => trades.length > 0 && trades.every((trade) => selectedIds.includes(trade.id)),
    [trades, selectedIds]
  );

  function beginEdit(trade) {
    setEditingId(trade.id);
    setDraft(createFormState(trade));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function handleSave(tradeId) {
    await onSave(tradeId, {
      ...draft,
      quantity: Number(draft.quantity),
      entryPrice: Number(draft.entryPrice),
      exitPrice: draft.exitPrice ? Number(draft.exitPrice) : null,
      fees: draft.fees ? Number(draft.fees) : 0,
      entryDate: new Date(draft.entryDate).toISOString(),
      exitDate: draft.exitDate ? new Date(draft.exitDate).toISOString() : null
    });
    cancelEdit();
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-xs uppercase tracking-[0.25em] text-mist">
              <th className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggleAll(trades, !allSelected)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                />
              </th>
              <th className="px-4 py-4">Trader</th>
              <th className="px-4 py-4">Symbol</th>
              <th className="px-4 py-4">Side</th>
              <th className="px-4 py-4">Entry</th>
              <th className="px-4 py-4">Exit</th>
              <th className="px-4 py-4">Quantity</th>
              <th className="px-4 py-4">Fees</th>
              <th className="px-4 py-4">P&amp;L</th>
              <th className="px-4 py-4">Strategy</th>
              <th className="px-4 py-4">Entry Date</th>
              <th className="px-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-slate-950/20">
            {trades.map((trade) => {
              const isEditing = editingId === trade.id;
              const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);

              return (
                <tr key={trade.id} className="align-top transition hover:bg-white/5">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(trade.id)}
                      onChange={() => onToggleSelection(trade.id)}
                      className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-4 text-slate-200">
                    <div className="font-medium text-white">{trade.user?.name || "-"}</div>
                    <div className="text-xs text-mist">{trade.user?.email || "-"}</div>
                  </td>

                  {isEditing ? (
                    <>
                      <td className="px-4 py-4">
                        <input
                          name="symbol"
                          value={draft.symbol}
                          onChange={handleChange}
                          className="w-24 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <select
                          name="side"
                          value={draft.side}
                          onChange={handleChange}
                          className="w-24 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        >
                          <option value="LONG">LONG</option>
                          <option value="SHORT">SHORT</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <input
                          name="entryPrice"
                          type="number"
                          step="0.0001"
                          value={draft.entryPrice}
                          onChange={handleChange}
                          className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          name="exitPrice"
                          type="number"
                          step="0.0001"
                          value={draft.exitPrice}
                          onChange={handleChange}
                          className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          name="quantity"
                          type="number"
                          step="0.0001"
                          value={draft.quantity}
                          onChange={handleChange}
                          className="w-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <input
                          name="fees"
                          type="number"
                          step="0.0001"
                          value={draft.fees}
                          onChange={handleChange}
                          className="w-24 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4 text-slate-300">{formatCurrency(pnl)}</td>
                      <td className="px-4 py-4">
                        <input
                          name="strategy"
                          value={draft.strategy}
                          onChange={handleChange}
                          className="w-32 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <input
                            name="entryDate"
                            type="datetime-local"
                            value={draft.entryDate}
                            onChange={handleChange}
                            className="w-48 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                          />
                          <input
                            name="exitDate"
                            type="datetime-local"
                            value={draft.exitDate}
                            onChange={handleChange}
                            className="w-48 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-white outline-none focus:border-mint"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleSave(trade.id)}
                            disabled={isSaving}
                            className="block rounded-full bg-mint px-4 py-2 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="block rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-4 font-semibold text-white">{trade.symbol}</td>
                      <td className="px-4 py-4 text-slate-200">{trade.side}</td>
                      <td className="px-4 py-4 text-slate-200">{trade.entryPrice}</td>
                      <td className="px-4 py-4 text-slate-200">{trade.exitPrice ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-200">{trade.quantity}</td>
                      <td className="px-4 py-4 text-slate-200">{trade.fees ?? 0}</td>
                      <td
                        className={`px-4 py-4 font-semibold ${
                          pnl >= 0 ? "text-mint" : "text-coral"
                        }`}
                      >
                        {formatCurrency(pnl)}
                      </td>
                      <td className="px-4 py-4 text-slate-200">{trade.strategy || "-"}</td>
                      <td className="px-4 py-4 text-slate-200">{formatDate(trade.entryDate)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(trade)}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-mint hover:text-mint"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(trade.id)}
                            disabled={isDeleting}
                            className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminTradeTable;
