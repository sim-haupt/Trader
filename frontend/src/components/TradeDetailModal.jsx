import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import tradeService from "../services/tradeService";
import TradeReviewCharts from "./TradeReviewCharts";
import Card from "./ui/Card";
import { formatCurrency, formatDate, formatDateTimeLocal } from "../utils/formatters";
import {
  buildDayRunningPnl,
  buildTradeRunningPnl,
  buildTradeTimeline,
  formatHoldTime,
  getDisplayedExecutionCount,
  getTradeHoldMinutes,
  getTradePnl
} from "../utils/tradeDetail";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";

function SummaryMetric({ label, value, accent = "text-white" }) {
  return (
    <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] ${accent}`}>{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1016]/95 px-3 py-2 text-xs text-phosphor shadow-[0_20px_50px_rgba(0,0,0,0.42)]">
      <div className="font-medium text-white">{label}</div>
      <div className="mt-1 text-mint">{formatCurrency(payload[0].value)}</div>
    </div>
  );
}

function TimelineTable({ rows }) {
  return (
    <div className="ui-table-shell">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/[0.04]">
            <tr className="ui-title text-left text-[11px] text-white/52">
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Date / Time</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-transparent">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-4 font-medium text-phosphor">{row.label}</td>
                <td className="px-4 py-4 text-mist">{formatDateTimeLocal(row.time).replace("T", " ")}</td>
                <td className="px-4 py-4 text-mist">{row.symbol}</td>
                <td className={`px-4 py-4 ${Number(row.quantity) >= 0 ? "text-mint" : "text-coral"}`}>
                  {row.quantity}
                </td>
                <td className="px-4 py-4 text-mist">{formatCurrency(row.price)}</td>
                <td className="px-4 py-4 text-mist">{row.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose }) {
  const initialDayStart = new Date(trade.entryDate);
  initialDayStart.setHours(0, 0, 0, 0);
  const initialDayEnd = new Date(trade.entryDate);
  initialDayEnd.setHours(23, 59, 59, 999);
  const initialDayFilters = {
    from: initialDayStart.toISOString(),
    to: initialDayEnd.toISOString()
  };
  const {
    data: tradeDetail,
    loading: loadingTradeDetail,
    error: tradeDetailError,
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrade(trade.id),
    load: () => tradeService.getTrade(trade.id),
    initialValue: trade,
    deps: [trade.id]
  });
  const {
    data: dayTrades,
    loading: loadingDayTrades,
    error: dayTradesError
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrades(initialDayFilters),
    load: () => tradeService.getTrades(initialDayFilters),
    initialValue: [],
    enabled: Boolean(tradeDetail?.entryDate),
    deps: [tradeDetail?.entryDate]
  });

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const activeTrade = tradeDetail || trade;
  const tradePnl = getTradePnl(activeTrade);
  const holdMinutes = getTradeHoldMinutes(activeTrade);
  const executionCount = getDisplayedExecutionCount(activeTrade);
  const tradeRunningPnl = useMemo(() => buildTradeRunningPnl(activeTrade), [activeTrade]);
  const tradeTimeline = useMemo(() => buildTradeTimeline(activeTrade), [activeTrade]);
  const dayRunningPnl = useMemo(
    () => buildDayRunningPnl(activeTrade, dayTrades),
    [activeTrade, dayTrades]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur">
      <div className="w-full max-w-[1520px] rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,19,26,0.98),rgba(9,11,16,0.98))] shadow-glow">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-6 py-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-bold tracking-[-0.05em] text-white">{activeTrade.symbol}</h2>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  activeTrade.side === "LONG" ? "bg-mint/15 text-mint" : "bg-coral/15 text-coral"
                }`}
              >
                {activeTrade.side}
              </span>
            </div>
            <p className="mt-2 text-base text-white/60">
              {formatDate(activeTrade.entryDate)} · Entry {formatCurrency(activeTrade.entryPrice)} · Exit{" "}
              {activeTrade.exitPrice != null ? formatCurrency(activeTrade.exitPrice) : "Open"}
            </p>
          </div>

            <button
              type="button"
              onClick={onClose}
              className="ui-button border-coral/25 bg-coral/10 text-sm text-coral"
            >
              Close
            </button>
        </div>

        <div className="space-y-6 p-6">
          {tradeDetailError && (
            <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">
              {tradeDetailError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              label="Trade P&L"
              value={formatCurrency(tradePnl)}
              accent={tradePnl >= 0 ? "text-mint" : "text-coral"}
            />
            <SummaryMetric label="Quantity" value={String(activeTrade.quantity)} />
            <SummaryMetric label="Hold Time" value={formatHoldTime(holdMinutes)} />
            <SummaryMetric label="Executions" value={String(executionCount)} />
          </div>

          <Card
            title="Executions"
            subtitle="Stored execution rows for this trade. This table is pinned near the top so it is visible immediately when the trade opens."
          >
            <TimelineTable rows={tradeTimeline} />
          </Card>

          <Card
            title="Execution Review Charts"
            subtitle="Custom 1 minute chart with execution markers drawn at the exact execution price."
          >
            <TradeReviewCharts trade={activeTrade} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
            <Card
              title="Trade Running P&L"
              subtitle="Realized progression across the executions we have stored for this trade."
            >
              {loadingTradeDetail ? (
                <div className="flex h-[290px] items-center justify-center text-sm text-mist">
                  Loading trade detail...
                </div>
              ) : (
                <div className="h-[290px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tradeRunningPnl}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#bcc4d4", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value}`}
                        tick={{ fill: "#bcc4d4", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke={tradePnl >= 0 ? "#6ef0c3" : "#ff7e6b"}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: tradePnl >= 0 ? "#6ef0c3" : "#ff7e6b" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card
              title="Day Running P&L"
              subtitle="All trades from the same day, accumulated in close order."
            >
              {loadingDayTrades ? (
                <div className="flex h-[290px] items-center justify-center text-sm text-mist">
                  Loading same-day trades...
                </div>
              ) : dayTradesError ? (
                <div className="flex h-[290px] items-center justify-center text-sm text-coral">
                  {dayTradesError}
                </div>
              ) : (
                <div className="h-[290px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dayRunningPnl}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#bcc4d4", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value}`}
                        tick={{ fill: "#bcc4d4", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="#ff5a4a"
                        strokeWidth={3}
                        dot={false}
                      />
                      {dayRunningPnl
                        .filter((point) => point.isSelected)
                        .map((point) => (
                          <ReferenceDot
                            key={point.id}
                            x={point.label}
                            y={point.pnl}
                            r={6}
                            fill="#d7f06e"
                            stroke="transparent"
                          />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Trade Notes" subtitle="Quick context around the setup and result.">
              <div className="space-y-4">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="ui-title text-xs text-white/48">Strategy</p>
                  <p className="mt-2 text-sm text-phosphor">{activeTrade.strategy || "No strategy tagged"}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="ui-title text-xs text-white/48">Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/60">
                    {activeTrade.notes || "No notes captured for this trade yet."}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-4">
                  <p className="ui-title text-xs text-white/48">Execution Coverage</p>
                  <p className="mt-2 text-sm text-white/60">
                    {Array.isArray(activeTrade.executions) && activeTrade.executions.length > 2
                      ? "This trade includes stored execution rows and the review charts use them directly."
                      : "This trade currently has aggregate execution coverage only. TradeVue CSV exports give the merged trade plus execution count, not the original fill timestamps."}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
