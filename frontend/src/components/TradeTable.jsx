import { formatCurrency, formatDate } from "../utils/formatters";

function TradeTable({ trades, onEdit, onDelete, onSelectTrade, showActions = true }) {
  return (
    <div className="ui-table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-[linear-gradient(180deg,rgba(255,255,255,0.024),rgba(255,255,255,0.008))]">
            <tr className="ui-title text-left text-[11px] text-white/58">
              <th className="px-4 py-4">DATE</th>
              <th className="px-4 py-4">SYMBOL</th>
              <th className="px-4 py-4">ENTRY</th>
              <th className="px-4 py-4">EXIT</th>
              <th className="px-4 py-4">QUANTITY</th>
              <th className="px-4 py-4">EXECUTIONS</th>
              <th className="px-4 py-4">P&amp;L</th>
              {showActions && <th className="px-4 py-4">ACTIONS</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-transparent">
            {trades.map((trade, index) => {
              const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);
              const executionCount =
                Number(trade.reportedExecutionCount ?? trade.executions?.length ?? 0) || 0;
              const currentDate = formatDate(trade.entryDate);
              const previousDate = index > 0 ? formatDate(trades[index - 1].entryDate) : null;
              const startsNewDay = currentDate !== previousDate;

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
                  className={`cursor-pointer transition hover:bg-white/[0.025] focus:bg-white/[0.025] focus:outline-none ${
                    startsNewDay ? "border-t border-white/20" : ""
                  }`}
                  style={startsNewDay ? { boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)" } : undefined}
                >
                  <td className="px-4 py-4 text-white/88">{formatDate(trade.entryDate)}</td>
                  <td className="px-4 py-4">
                    <div className="text-[15px] font-semibold tracking-[-0.02em] text-white">{trade.symbol}</div>
                    {trade.tags ? <div className="mt-1 text-xs text-white/52">{trade.tags}</div> : null}
                    {!trade.tags && trade.notes ? (
                      <div className="mt-1 max-w-[220px] truncate text-xs text-white/42">{trade.notes}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-white/84">{trade.entryPrice}</td>
                  <td className="px-4 py-4 text-white/84">{trade.exitPrice ?? "-"}</td>
                  <td className="px-4 py-4 text-white/84">{trade.quantity}</td>
                  <td className="px-4 py-4 text-white/84">{executionCount || "-"}</td>
                  <td
                    className={`px-4 py-4 font-semibold ${
                      pnl >= 0 ? "text-mint" : "text-coral"
                    }`}
                  >
                    {formatCurrency(pnl)}
                  </td>
                  {showActions && (
                    <td className="px-4 py-4">
                      <div className="flex flex-nowrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(trade);
                          }}
                          className="ui-button px-3 py-1.5 text-[11px]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(trade);
                          }}
                          className="ui-button border-coral/25 bg-coral/10 px-3 py-1.5 text-[11px] text-coral"
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
