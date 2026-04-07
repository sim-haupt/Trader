import { formatCurrency, formatDate } from "../utils/formatters";

function TradeTable({ trades, onEdit, onDelete, onSelectTrade, showActions = true }) {
  return (
    <div className="ui-table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-[linear-gradient(90deg,rgba(58,58,66,0.82),rgba(33,33,39,0.78),rgba(20,20,24,0.78))]">
            <tr className="ui-title text-left text-[11px] text-mist">
              <th className="px-4 py-4">Symbol</th>
              <th className="px-4 py-4">Side</th>
              <th className="px-4 py-4">Entry</th>
              <th className="px-4 py-4">Exit</th>
              <th className="px-4 py-4">Quantity</th>
              <th className="px-4 py-4">Executions</th>
              <th className="px-4 py-4">P&amp;L</th>
              <th className="px-4 py-4">Strategy</th>
              <th className="px-4 py-4">Date</th>
              {showActions && <th className="px-4 py-4">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-[linear-gradient(180deg,rgba(16,12,24,0.78),rgba(8,6,12,0.82))]">
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
                  <td className="px-4 py-4 ui-title text-phosphor">{trade.symbol}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex border px-3 py-1 text-[11px] font-medium ${
                        trade.side === "LONG"
                          ? "border-mint/35 bg-mint/10 text-mint"
                          : "border-coral/35 bg-coral/10 text-coral"
                      }`}
                    >
                      {trade.side}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-mist">{trade.entryPrice}</td>
                  <td className="px-4 py-4 text-mist">{trade.exitPrice ?? "-"}</td>
                  <td className="px-4 py-4 text-mist">{trade.quantity}</td>
                  <td className="px-4 py-4 text-mist">{executionCount || "-"}</td>
                  <td
                    className={`px-4 py-4 font-semibold ${
                      pnl >= 0 ? "text-mint" : "text-coral"
                    }`}
                  >
                    {formatCurrency(pnl)}
                  </td>
                  <td className="px-4 py-4 text-mist">{trade.strategy || "-"}</td>
                  <td className="px-4 py-4 text-mist">{formatDate(trade.entryDate)}</td>
                  {showActions && (
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
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
