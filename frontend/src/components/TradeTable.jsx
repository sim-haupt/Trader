import { formatCurrency, formatDate } from "../utils/formatters";

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M13.958 3.542a1.5 1.5 0 0 1 2.122 0l.378.378a1.5 1.5 0 0 1 0 2.122l-8.75 8.75-3.166.792.791-3.166 8.625-8.876Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m12.5 5 2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4.167 5.833h11.666M7.5 2.917h5m-6.25 2.916.417 9.167A1.667 1.667 0 0 0 8.75 16.667h2.5a1.667 1.667 0 0 0 1.666-1.667l.417-9.167"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TradeTable({
  trades,
  onEdit,
  onDelete,
  onSelectTrade,
  showActions = true,
  selectedIds = [],
  onToggleSelection,
  onToggleAll
}) {
  const allSelected = trades.length > 0 && trades.every((trade) => selectedIds.includes(trade.id));
  const columnCount = (onToggleSelection ? 1 : 0) + 7 + (showActions ? 1 : 0);

  return (
    <div className="ui-table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--line)] text-sm">
          <thead className="bg-[#050505]">
            <tr className="ui-title text-left text-[11px] text-white/58">
              {onToggleSelection && (
                <th className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onToggleAll?.(trades, !allSelected)}
                    className="h-4 w-4 rounded border-[#e5e7eb42] bg-transparent"
                  />
                </th>
              )}
              <th className="px-4 py-4">DATE</th>
              <th className="px-4 py-4">SYMBOL</th>
              <th className="px-4 py-4">STRATEGY</th>
              <th className="px-4 py-4">TAGS</th>
              <th className="px-4 py-4">QUANTITY</th>
              <th className="px-4 py-4">EXECUTIONS</th>
              <th className="px-4 py-4">P&amp;L</th>
              {showActions && <th className="px-4 py-4">ACTIONS</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] bg-transparent">
            {trades.map((trade, index) => {
              const pnl = Number(trade.netPnl ?? trade.grossPnl ?? 0);
              const executionCount =
                Number(trade.reportedExecutionCount ?? trade.executions?.length ?? 0) || 0;
              const currentDate = formatDate(trade.entryDate);
              const previousDate = index > 0 ? formatDate(trades[index - 1].entryDate) : null;
              const startsNewDay = currentDate !== previousDate;

              return (
                <>
                  {startsNewDay ? (
                    <tr key={`${trade.id}-day-divider`} aria-hidden="true">
                      <td colSpan={columnCount} className="px-4 py-4 align-middle">
                        <div className="flex min-h-[44px] items-center gap-3">
                          <span className="ui-title rounded-[6px] border border-[var(--line-strong)] bg-black px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
                            {currentDate}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
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
                    className="cursor-pointer bg-[rgba(255,255,255,0.05)] transition hover:bg-white/[0.08] focus:bg-white/[0.08] focus:outline-none"
                  >
                    {onToggleSelection && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(trade.id)}
                          onChange={(event) => {
                            event.stopPropagation();
                            onToggleSelection(trade.id);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          className="h-4 w-4 rounded border-[#e5e7eb42] bg-transparent"
                        />
                      </td>
                    )}
                    <td className="px-4 py-4 text-white/88">{formatDate(trade.entryDate)}</td>
                    <td className="px-4 py-4">
                      <div className="text-[15px] font-semibold tracking-[-0.02em] text-white">{trade.symbol}</div>
                    </td>
                    <td className="px-4 py-4 text-white/84">
                      {trade.strategy ? (
                        <span className="text-sm font-medium text-white/80">{trade.strategy}</span>
                      ) : (
                        <span className="text-sm text-white/36">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-white/84">
                      {trade.tags ? (
                        <div className="flex max-w-[18rem] flex-wrap gap-2">
                          {trade.tags
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <span
                                key={`${trade.id}-${tag}`}
                                className="inline-flex items-center rounded-[6px] border border-[var(--line)] bg-black px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      ) : (
                        <span className="text-sm text-white/36">-</span>
                      )}
                    </td>
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
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onEdit(trade);
                            }}
                            className="ui-button inline-flex h-9 w-9 items-center justify-center rounded-[6px] p-0 text-white/70 hover:text-white"
                            aria-label={`Edit ${trade.symbol} trade`}
                            title="Edit trade"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(trade);
                            }}
                            className="ui-button-danger inline-flex h-9 w-9 items-center justify-center rounded-[6px] p-0"
                            aria-label={`Delete ${trade.symbol} trade`}
                            title="Delete trade"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TradeTable;
