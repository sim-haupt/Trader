import { formatCurrency, formatDate } from "../utils/formatters";

function TradeTable({ trades, onEdit, onDelete, onSelectTrade, showActions = true }) {
  return (
    <div className="ui-table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-[linear-gradient(90deg,rgba(24,24,24,0.96),rgba(16,16,16,0.92),rgba(10,10,10,0.9))]">
            <tr className="ui-title text-left text-[11px] text-mist">
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
          <tbody className="divide-y divide-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.86),rgba(8,8,8,0.92))]">
            {trades.map((trade) => {
              const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);
              const executionCount =
                Number(trade.reportedExecutionCount ?? trade.executions?.length ?? 0) || 0;

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
                  <td className="px-4 py-4 text-white/90">{formatDate(trade.entryDate)}</td>
                  <td className="px-4 py-4 ui-title text-white">{trade.symbol}</td>
                  <td className="px-4 py-4 text-white/90">{trade.entryPrice}</td>
                  <td className="px-4 py-4 text-white/90">{trade.exitPrice ?? "-"}</td>
                  <td className="px-4 py-4 text-white/90">{trade.quantity}</td>
                  <td className="px-4 py-4 text-white/90">{executionCount || "-"}</td>
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
                          className="ui-button border-coral/35 bg-[linear-gradient(180deg,#452222,#2d1616)] px-3 py-1.5 text-[11px] text-coral hover:brightness-110"
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
