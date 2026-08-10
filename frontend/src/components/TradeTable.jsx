import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatCurrency, formatDate, formatDateTimeLocal } from "../utils/formatters";
import { getTradeNetPnl, getTradePerSharePnl } from "../utils/tradePnl";
import TradeReviewCharts from "./TradeReviewCharts";

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

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3.333 15.833h13.334M4.167 13.333l3.333-4.166 3.333 2.5 4.167-6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path d="m7.5 4.167 5.833 5.833L7.5 15.833" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getDayKey(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(0, 10) : "";
}

function uniqueList(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function getExecutionCount(trade) {
  return Number(trade.reportedExecutionCount ?? trade.executions?.length ?? 0) || 0;
}

function summarizeGroup(trades) {
  const netPnl = trades.reduce((sum, trade) => sum + getTradeNetPnl(trade), 0);
  const quantity = trades.reduce((sum, trade) => sum + Math.abs(Number(trade.quantity || 0)), 0);
  const executionCount = trades.reduce((sum, trade) => sum + getExecutionCount(trade), 0);
  const perSharePnl = trades.reduce((sum, trade) => {
    const pnl = getTradeNetPnl(trade);
    return sum + getTradePerSharePnl(trade, pnl);
  }, 0);
  const sides = uniqueList(trades.map((trade) => trade.side));

  return {
    netPnl: Number(netPnl.toFixed(4)),
    quantity,
    executionCount,
    sideLabel: sides.length === 1 ? sides[0] : "Mixed",
    perSharePnl: Number(perSharePnl.toFixed(4))
  };
}

export function buildTradeGroups(trades) {
  const groupsByKey = new Map();

  for (const trade of trades) {
    const dayKey = getDayKey(trade.entryDate);
    const symbol = String(trade.symbol || "").trim().toUpperCase();
    const groupKey = `${dayKey}:${symbol}`;
    const current = groupsByKey.get(groupKey) || {
      id: groupKey,
      dayKey,
      dayLabel: formatDate(trade.entryDate),
      symbol,
      entryDate: trade.entryDate,
      trades: []
    };

    current.trades.push(trade);
    if (new Date(trade.entryDate).getTime() < new Date(current.entryDate).getTime()) {
      current.entryDate = trade.entryDate;
    }

    groupsByKey.set(groupKey, current);
  }

  return Array.from(groupsByKey.values()).map((group) => ({
    ...group,
    trades: [...group.trades].sort((left, right) => new Date(left.entryDate).getTime() - new Date(right.entryDate).getTime()),
    ...summarizeGroup(group.trades)
  }));
}

function TagsCell({ tags, tradeId = "group" }) {
  if (!tags.length) {
    return <span className="text-sm text-white/36">-</span>;
  }

  return (
    <div className="flex max-w-[18rem] flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={`${tradeId}-${tag}`} className="ui-chip">
          {tag}
        </span>
      ))}
    </div>
  );
}

function ActionButton({ label, children, className = "", onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ui-button inline-flex h-9 w-9 items-center justify-center rounded-[6px] p-0 text-white/70 hover:text-white ${className}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function TradeCountBadge({ count }) {
  return (
    <span className="text-sm font-medium text-white/58" aria-label={`${count} ${count === 1 ? "trade" : "trades"}`}>
      ({count})
    </span>
  );
}

function TradeTable({
  trades,
  groups,
  onEdit,
  onDelete,
  onSelectTrade,
  showActions = true,
  showChartAction = showActions,
  showTradeActions = showActions,
  showDayDividers = true,
  selectedIds = [],
  onToggleSelection,
  onToggleAll
}) {
  const tradeGroups = useMemo(() => groups || buildTradeGroups(trades), [groups, trades]);
  const visibleTrades = useMemo(() => tradeGroups.flatMap((group) => group.trades), [tradeGroups]);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [chartGroup, setChartGroup] = useState(null);
  const allSelected = visibleTrades.length > 0 && visibleTrades.every((trade) => selectedIds.includes(trade.id));
  const hasActionColumn = showChartAction || showTradeActions;
  const columnCount = (onToggleSelection ? 1 : 0) + 9 + (hasActionColumn ? 1 : 0);

  useEffect(() => {
    if (!chartGroup) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setChartGroup(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chartGroup]);

  function toggleGroup(groupId) {
    setExpandedGroups((current) => {
      const next = new Set(current);

      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }

      return next;
    });
  }

  const chartModal = chartGroup
    ? createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/82 px-4 py-8 backdrop-blur-sm"
          role="presentation"
          onMouseDown={() => setChartGroup(null)}
        >
          <div
            className="w-full max-w-7xl rounded-[6px] border border-[var(--line)] bg-[var(--black-0)] p-5 shadow-none"
            role="dialog"
            aria-modal="true"
            aria-label={`${chartGroup.symbol} chart`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="ui-title text-lg text-white">{chartGroup.symbol} · {chartGroup.dayLabel}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TradeCountBadge count={chartGroup.trades.length} />
                  <span className="text-sm text-white/58">
                    {chartGroup.executionCount} execution{chartGroup.executionCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <button type="button" className="ui-button-solid px-4 py-2 text-sm" onClick={() => setChartGroup(null)}>
                Close
              </button>
            </div>
            <TradeReviewCharts
              trades={chartGroup.trades}
              title={`${chartGroup.symbol} entries and exits`}
            />
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div className="ui-table-shell">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--line)] text-sm">
            <thead className="ui-widget-heading-bg">
              <tr className="ui-title text-left text-[11px] text-white/58">
                {onToggleSelection && (
                  <th className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onToggleAll?.(visibleTrades, !allSelected)}
                      className="h-4 w-4 rounded border-[#e5e7eb42] bg-transparent"
                    />
                  </th>
                )}
                <th className="px-4 py-4">DATE</th>
                <th className="px-4 py-4">SYMBOL</th>
                <th className="px-4 py-4">SIDE</th>
                <th className="px-4 py-4">STRATEGY</th>
                <th className="px-4 py-4">TAGS</th>
                <th className="px-4 py-4">QUANTITY</th>
                <th className="px-4 py-4">EXECUTIONS</th>
                <th className="px-4 py-4">P&amp;L</th>
                <th className="px-4 py-4">P&amp;L / SHARE</th>
                {hasActionColumn && <th className="px-4 py-4">ACTIONS</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] bg-transparent">
              {tradeGroups.map((group, index) => {
                const groupSelected = group.trades.every((trade) => selectedIds.includes(trade.id));
                const currentDate = group.dayLabel;
                const previousDate = index > 0 ? tradeGroups[index - 1].dayLabel : null;
                const startsNewDay = showDayDividers && currentDate !== previousDate;
                const isExpanded = expandedGroups.has(group.id);

                return (
                  <Fragment key={group.id}>
                    {startsNewDay ? (
                      <tr key={`${group.id}-day-divider`} aria-hidden="true">
                        <td colSpan={columnCount} className="px-4 py-4 align-middle">
                          <div className="flex min-h-[44px] items-center gap-3">
                            <span className="ui-surface-subtle ui-title px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
                              {currentDate}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : null}

                    <tr key={group.id} className="bg-white/[0.045] transition hover:bg-white/[0.065]">
                      {onToggleSelection && (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={groupSelected}
                            onChange={(event) => {
                              event.stopPropagation();
                              onToggleAll?.(group.trades, !groupSelected);
                            }}
                            className="h-4 w-4 rounded border-[#e5e7eb42] bg-transparent"
                          />
                        </td>
                      )}
                      <td className="px-4 py-4 text-white/88">{group.dayLabel}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.id)}
                          className="inline-flex items-center gap-2 text-left text-[15px] font-semibold tracking-[-0.02em] text-white transition hover:text-white/78"
                          aria-expanded={isExpanded}
                        >
                          <ChevronIcon open={isExpanded} />
                          <span>{group.symbol}</span>
                          <TradeCountBadge count={group.trades.length} />
                        </button>
                      </td>
                      <td className="px-4 py-4 text-white/84">{group.sideLabel}</td>
                      <td className="px-4 py-4 text-white/84">
                        <span className="text-sm text-white/36">-</span>
                      </td>
                      <td className="px-4 py-4 text-white/84">
                        <span className="text-sm text-white/36">-</span>
                      </td>
                      <td className="px-4 py-4 text-white/84">{Number(group.quantity.toFixed(2)).toLocaleString("en-US")}</td>
                      <td className="px-4 py-4 text-white/84">{group.executionCount || "-"}</td>
                      <td className={`px-4 py-4 font-semibold ${group.netPnl >= 0 ? "text-mint" : "text-coral"}`}>
                        {formatCurrency(group.netPnl)}
                      </td>
                      <td className={`px-4 py-4 font-semibold ${group.perSharePnl >= 0 ? "text-mint" : "text-coral"}`}>
                        {formatCurrency(group.perSharePnl)}
                      </td>
                      {hasActionColumn && (
                        <td className="px-4 py-4">
                          {showChartAction ? (
                            <ActionButton label={`Open ${group.symbol} chart`} onClick={() => setChartGroup(group)}>
                              <ChartIcon />
                            </ActionButton>
                          ) : null}
                        </td>
                      )}
                    </tr>

                    {isExpanded &&
                      group.trades.map((trade) => {
                        const pnl = getTradeNetPnl(trade);
                        const perSharePnl = getTradePerSharePnl(trade, pnl);
                        const tags = String(trade.tags || "")
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean);

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
                            className="cursor-pointer bg-black/20 transition hover:bg-white/[0.04] focus:bg-white/[0.04] focus:outline-none"
                          >
                            {onToggleSelection && (
                              <td className="px-4 py-3">
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
                            <td className="px-4 py-3 text-white/58">{formatDate(trade.entryDate)}</td>
                            <td className="px-4 py-3">
                              <div className="pl-6 text-sm font-semibold text-white/78">{trade.symbol}</div>
                            </td>
                            <td className="px-4 py-3 text-white/64">{trade.side}</td>
                            <td className="px-4 py-3 text-white/64">
                              {trade.setup ? <span className="ui-chip ui-setup-pill">{trade.setup}</span> : <span className="text-sm text-white/36">-</span>}
                            </td>
                            <td className="px-4 py-3 text-white/64">
                              <TagsCell tags={tags} tradeId={trade.id} />
                            </td>
                            <td className="px-4 py-3 text-white/64">{trade.quantity}</td>
                            <td className="px-4 py-3 text-white/64">{getExecutionCount(trade) || "-"}</td>
                            <td className={`px-4 py-3 font-semibold ${pnl >= 0 ? "text-mint" : "text-coral"}`}>
                              {formatCurrency(pnl)}
                            </td>
                            <td className={`px-4 py-3 font-semibold ${perSharePnl >= 0 ? "text-mint" : "text-coral"}`}>
                              {formatCurrency(perSharePnl)}
                            </td>
                            {hasActionColumn && (
                              <td className="px-4 py-3">
                                {showTradeActions ? (
                                  <div className="flex items-center gap-2">
                                    <ActionButton
                                      label={`Edit ${trade.symbol} trade`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onEdit?.(trade);
                                      }}
                                    >
                                      <EditIcon />
                                    </ActionButton>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onDelete?.(trade);
                                      }}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] border border-coral/35 bg-coral/10 p-0 text-coral transition hover:bg-coral/15"
                                      aria-label={`Delete ${trade.symbol} trade`}
                                      title="Delete trade"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {chartModal}
    </>
  );
}

export default TradeTable;
