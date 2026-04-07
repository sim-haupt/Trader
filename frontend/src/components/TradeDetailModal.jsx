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
import TradingViewChart from "./TradingViewChart";
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

function SummaryMetric({ label, value, accent = "text-white" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-mist">{label}</p>
      <p className={`mt-3 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-xl">
      <div className="font-medium">{label}</div>
      <div className="mt-1 text-mint">{formatCurrency(payload[0].value)}</div>
    </div>
  );
}

function TimelineTable({ rows }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5">
            <tr className="text-left text-xs uppercase tracking-[0.25em] text-mist">
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Date / Time</th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 bg-slate-950/20">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-4 font-medium text-white">{row.label}</td>
                <td className="px-4 py-4 text-slate-200">{formatDateTimeLocal(row.time).replace("T", " ")}</td>
                <td className="px-4 py-4 text-slate-200">{row.symbol}</td>
                <td className="px-4 py-4 text-slate-200">{row.quantity}</td>
                <td className="px-4 py-4 text-slate-200">{formatCurrency(row.price)}</td>
                <td className="px-4 py-4 text-slate-200">{row.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose }) {
  const [tradeDetail, setTradeDetail] = useState(trade);
  const [loadingTradeDetail, setLoadingTradeDetail] = useState(true);
  const [tradeDetailError, setTradeDetailError] = useState("");
  const [dayTrades, setDayTrades] = useState([]);
  const [loadingDayTrades, setLoadingDayTrades] = useState(true);
  const [dayTradesError, setDayTradesError] = useState("");

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    let active = true;

    async function loadTradeDetail() {
      setLoadingTradeDetail(true);
      setTradeDetailError("");

      try {
        const data = await tradeService.getTrade(trade.id);
        if (active) {
          setTradeDetail(data);
        }
      } catch (error) {
        if (active) {
          setTradeDetailError(error.message);
        }
      } finally {
        if (active) {
          setLoadingTradeDetail(false);
        }
      }
    }

    loadTradeDetail();

    return () => {
      active = false;
    };
  }, [trade.id]);

  useEffect(() => {
    let active = true;

    async function loadDayTrades() {
      if (!tradeDetail?.entryDate) {
        return;
      }

      setLoadingDayTrades(true);
      setDayTradesError("");

      const tradeDayStart = new Date(tradeDetail.entryDate);
      tradeDayStart.setHours(0, 0, 0, 0);
      const tradeDayEnd = new Date(tradeDetail.entryDate);
      tradeDayEnd.setHours(23, 59, 59, 999);

      try {
        const data = await tradeService.getTrades({
          from: tradeDayStart.toISOString(),
          to: tradeDayEnd.toISOString()
        });

        if (active) {
          setDayTrades(data);
        }
      } catch (error) {
        if (active) {
          setDayTradesError(error.message);
        }
      } finally {
        if (active) {
          setLoadingDayTrades(false);
        }
      }
    }

    loadDayTrades();

    return () => {
      active = false;
    };
  }, [tradeDetail]);

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur">
      <div className="w-full max-w-[1500px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,25,43,0.98),rgba(13,20,35,0.98))] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/85 px-6 py-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-white">{activeTrade.symbol}</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  activeTrade.side === "LONG" ? "bg-mint/15 text-mint" : "bg-coral/15 text-coral"
                }`}
              >
                {activeTrade.side}
              </span>
            </div>
            <p className="mt-2 text-sm text-mist">
              {formatDate(activeTrade.entryDate)} · Entry {formatCurrency(activeTrade.entryPrice)} · Exit{" "}
              {activeTrade.exitPrice != null ? formatCurrency(activeTrade.exitPrice) : "Open"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-coral hover:text-coral"
          >
            Close
          </button>
        </div>

        <div className="space-y-6 p-6">
          {tradeDetailError && (
            <div className="rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral">
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
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value}`}
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
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
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value}`}
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
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
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-mist">Strategy</p>
                  <p className="mt-2 text-sm text-white">{activeTrade.strategy || "No strategy tagged"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-mist">Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                    {activeTrade.notes || "No notes captured for this trade yet."}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-mist">Execution Coverage</p>
                  <p className="mt-2 text-sm text-slate-200">
                    {Array.isArray(activeTrade.executions) && activeTrade.executions.length > 2
                      ? "This trade includes stored execution rows and the review charts use them directly."
                      : "This trade currently has aggregate execution coverage only. TradeVue CSV exports give the merged trade plus execution count, not the original fill timestamps."}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="TradingView 1 Minute Context"
            subtitle="This chart gives symbol context on a 1-minute interval. The execution list below shows the exact stored timestamps driving this trade review."
          >
            <TradingViewChart symbol={activeTrade.symbol} />
          </Card>

          <Card
            title="Executions"
            subtitle="Stored entry, exit, or imported fill events for this trade."
          >
            <TimelineTable rows={tradeTimeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
