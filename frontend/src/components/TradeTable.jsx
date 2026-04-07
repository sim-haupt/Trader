import { formatCurrency, formatDate } from "../utils/formatters";

function TradeTable({ trades, onEdit, onDelete, onSelectTrade, showActions = true }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-xs uppercase tracking-[0.25em] text-mist">
              <th className="px-4 py-4">Symbol</th>
              <th className="px-4 py-4">Side</th>
              <th className="px-4 py-4">Entry</th>
              <th className="px-4 py-4">Exit</th>
              <th className="px-4 py-4">Quantity</th>
              <th className="px-4 py-4">P&amp;L</th>
              <th className="px-4 py-4">Strategy</th>
              <th className="px-4 py-4">Date</th>
              {showActions && <th className="px-4 py-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-slate-950/20">
            {trades.map((trade) => {
              const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);

              return (
                <tr
                  key={trade.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => onSelectTrade?.(trade)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectTrade?.(trade);
                    }
                  }}
                  className="cursor-pointer transition hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                >
                  <td className="px-4 py-4 font-semibold text-white">{trade.symbol}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        trade.side === "LONG"
                          ? "bg-mint/15 text-mint"
                          : "bg-coral/15 text-coral"
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-200">{trade.entryPrice}</td>
                  <td className="px-4 py-4 text-slate-200">{trade.exitPrice ?? "-"}</td>
                  <td className="px-4 py-4 text-slate-200">{trade.quantity}</td>
                  <td
                    className={`px-4 py-4 font-semibold ${
                      pnl >= 0 ? "text-mint" : "text-coral"
                    }`}
                  >
                    {formatCurrency(pnl)}
                  </td>
                  <td className="px-4 py-4 text-slate-200">{trade.strategy || "-"}</td>
                  <td className="px-4 py-4 text-slate-200">{formatDate(trade.entryDate)}</td>
                  {showActions && (
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(trade);
                          }}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-mint hover:text-mint"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(trade);
                          }}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white transition hover:border-coral hover:text-coral"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
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

export default TradeTable;
