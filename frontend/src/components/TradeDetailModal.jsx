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

    async function loadDayTrades() {
      if (!trade?.entryDate) {
        return;
      }

      setLoadingDayTrades(true);
      setDayTradesError("");

      const tradeDayStart = new Date(trade.entryDate);
      tradeDayStart.setHours(0, 0, 0, 0);
      const tradeDayEnd = new Date(trade.entryDate);
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
  }, [trade]);

  const tradePnl = getTradePnl(trade);
  const holdMinutes = getTradeHoldMinutes(trade);
  const tradeRunningPnl = useMemo(() => buildTradeRunningPnl(trade), [trade]);
  const tradeTimeline = useMemo(() => buildTradeTimeline(trade), [trade]);
  const dayRunningPnl = useMemo(
    () => buildDayRunningPnl(trade, dayTrades),
    [dayTrades, trade]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur">
      <div className="w-full max-w-[1500px] rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,25,43,0.98),rgba(13,20,35,0.98))] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/85 px-6 py-5 backdrop-blur">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold text-white">{trade.symbol}</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  trade.side === "LONG" ? "bg-mint/15 text-mint" : "bg-coral/15 text-coral"
                }`}
              >
                {trade.side}
              </span>
            </div>
            <p className="mt-2 text-sm text-mist">
              {formatDate(trade.entryDate)} · Entry {formatCurrency(trade.entryPrice)} · Exit{" "}
              {trade.exitPrice != null ? formatCurrency(trade.exitPrice) : "Open"}
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              label="Trade P&L"
              value={formatCurrency(tradePnl)}
              accent={tradePnl >= 0 ? "text-mint" : "text-coral"}
            />
            <SummaryMetric label="Quantity" value={String(trade.quantity)} />
            <SummaryMetric label="Hold Time" value={formatHoldTime(holdMinutes)} />
            <SummaryMetric label="Fees" value={formatCurrency(trade.fees)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr_0.8fr]">
            <Card
              title="Trade Running P&L"
              subtitle="A simple realized path from entry to exit using the stored trade record."
            >
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
                  <p className="mt-2 text-sm text-white">{trade.strategy || "No strategy tagged"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-mist">Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                    {trade.notes || "No notes captured for this trade yet."}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card
            title="TradingView 1 Minute Context"
            subtitle="This chart gives symbol context on a 1-minute interval. Exact fill markers require execution-level data storage, so this first version anchors the review around the selected trade."
          >
            <TradingViewChart symbol={trade.symbol} />
          </Card>

          <Card
            title="Trade Timeline"
            subtitle="Current stored trade data gives us the entry and exit events. Once executions are stored individually, this section can expand to full fill-by-fill playback."
          >
            <TimelineTable rows={tradeTimeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
