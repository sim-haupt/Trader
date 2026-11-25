import TradeDisciplineCard from "./TradeDisciplineCard";
import TradeIntelligenceCard from "./TradeIntelligenceCard";
import TradeExitTiming from "./TradeExitTiming";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import tradeService from "../services/tradeService";
import TradeClassificationFields, { classificationDraft, classificationPayload, classificationReady } from "./TradeClassificationFields";
import { tradeSetups, tradeTags, uniqueLabels } from "../utils/tradeClassifications";
import { SavedEntryGrade } from "./EntryGradeFields";
import TradeReviewCharts from "./TradeReviewCharts";
import Card from "./ui/Card";
import LoadingState from "./ui/LoadingState";
import RichTextEditor from "./ui/RichTextEditor";
import { formatCurrency, formatDate, formatDateTimeLocal } from "../utils/formatters";
import { normalizeRichTextHtml } from "../utils/richText";
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
    <div className="ui-inset-box p-4">
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] ${accent}`}>{value}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const value = Number(point?.pnl ?? payload[0].value ?? 0);
  const valueClass = value < 0 ? "text-coral" : value > 0 ? "text-mint" : "text-white";

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-xs text-phosphor">
      <div className="font-medium text-white">{point?.label || label}</div>
      <div className={`mt-1 ${valueClass}`}>{formatCurrency(value)}</div>
    </div>
  );
}

function formatAxisTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function buildSignedChartSeries(points) {
  const withTime = points.map((point) => ({
    ...point,
    timeValue: new Date(point.timestamp).getTime()
  }));

  if (withTime.length === 0) {
    return { data: [] };
  }

  const toSplitPoint = (point, forceZero = false) => ({
    ...point,
    positivePnl: forceZero || point.pnl === 0 ? 0 : point.pnl > 0 ? point.pnl : null,
    negativePnl: forceZero || point.pnl === 0 ? 0 : point.pnl < 0 ? point.pnl : null
  });

  const data = [toSplitPoint(withTime[0])];

  for (let index = 1; index < withTime.length; index += 1) {
    const previousPoint = withTime[index - 1];
    const currentPoint = withTime[index];
    const crossedZero =
      (previousPoint.pnl < 0 && currentPoint.pnl > 0) ||
      (previousPoint.pnl > 0 && currentPoint.pnl < 0);

    if (crossedZero) {
      const span = currentPoint.timeValue - previousPoint.timeValue;
      const ratio = Math.abs(previousPoint.pnl) / (Math.abs(previousPoint.pnl) + Math.abs(currentPoint.pnl));
      const crossingTime = previousPoint.timeValue + span * ratio;

      data.push(
        toSplitPoint(
          {
            id: `${previousPoint.id}-${currentPoint.id}-zero`,
            label: formatAxisTime(crossingTime),
            timestamp: new Date(crossingTime).toISOString(),
            timeValue: crossingTime,
            pnl: 0,
            isSelected: false
          },
          true
        )
      );
    }

    data.push(toSplitPoint(currentPoint));
  }

  return { data };
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
              <th className="px-4 py-3">P&amp;L</th>
              <th className="px-4 py-3">P&amp;L / Share</th>
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
                <td
                  className={`px-4 py-4 ${
                    Number(row.pnl) > 0 ? "text-mint" : Number(row.pnl) < 0 ? "text-coral" : "text-mist"
                  }`}
                >
                  {formatCurrency(row.pnl)}
                </td>
                <td
                  className={`px-4 py-4 ${
                    Number(row.perSharePnl) > 0
                      ? "text-mint"
                      : Number(row.perSharePnl) < 0
                        ? "text-coral"
                        : "text-mist"
                  }`}
                >
                  {formatCurrency(row.perSharePnl)}
                </td>
                <td className="px-4 py-4 text-mist">{row.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getReviewChartHeights(width) {
  if (width < 640) {
    return {
      trade: 240,
      day: 260
    };
  }

  if (width < 1024) {
    return {
      trade: 270,
      day: 290
    };
  }

  return {
    trade: 290,
    day: 290
  };
}

function TradeDetailModal({ trade, onClose, pageMode = false }) {
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
  const [editableTrade, setEditableTrade] = useState(trade);
  const [classifications, setClassifications] = useState(null);
  const [metaError, setMetaError] = useState("");
  const [isNotesEditorOpen, setIsNotesEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(trade.notes || "");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  useEffect(() => {
    const nextTrade = tradeDetail || trade;
    setEditableTrade(nextTrade);
    setNoteDraft(nextTrade.notes || "");
  }, [trade, tradeDetail]);

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
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activeTrade = editableTrade || tradeDetail || trade;
  const tradePnl = getTradePnl(activeTrade);
  const holdMinutes = getTradeHoldMinutes(activeTrade);
  const executionCount = getDisplayedExecutionCount(activeTrade);
  const tradeRunningPnl = useMemo(
    () => buildTradeRunningPnl(activeTrade),
    [activeTrade]
  );
  const tradeTimeline = useMemo(
    () => buildTradeTimeline(activeTrade),
    [activeTrade]
  );
  const dayRunningPnl = useMemo(
    () => buildDayRunningPnl(activeTrade, dayTrades),
    [activeTrade, dayTrades]
  );
  const signedDayRunningPnl = useMemo(() => buildSignedChartSeries(dayRunningPnl), [dayRunningPnl]);
  const chartHeights = getReviewChartHeights(viewportWidth);
  const review = Number.isInteger(activeTrade.entryReview?.setupFit) ? activeTrade.entryReview : null;

  async function handleSaveClassifications(event) {
    event.preventDefault();
    if (!classificationReady(classifications) || isSavingMeta) return;
    setIsSavingMeta(true);
    setMetaError("");
    try {
      const saved = await tradeService.updateTradeMeta(activeTrade.id, classificationPayload(classifications));
      setEditableTrade(saved);
      setClassifications(null);
    } catch (error) {
      setMetaError(error.message);
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleSetSetup(name) {
    const setups = uniqueLabels([...tradeSetups(activeTrade), name]);
    const updated = await tradeService.updateTradeMeta(activeTrade.id, { setups });
    setEditableTrade(updated);
  }

  async function handleSaveNotes() {
    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        notes: noteDraft.trim()
      });

      setEditableTrade(updatedTrade);
      setIsNotesEditorOpen(false);
    } finally {
      setIsSavingMeta(false);
    }
  }

  return (
    <div
      className={
        pageMode
          ? "w-full max-w-full overflow-hidden"
          : "fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 px-3 pb-4 pt-0 backdrop-blur sm:px-4"
      }
    >
      <div
        className={
          pageMode
            ? "trade-detail-page-widget dashboard-page-widget ui-panel w-full overflow-hidden rounded-[6px]"
            : "w-full max-w-[1520px] overflow-hidden rounded-[6px] border border-[var(--line)] bg-black"
        }
      >
        <div className="ui-widget-heading-bg flex flex-col gap-4 border-b border-[var(--line)] px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="break-words text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">{activeTrade.symbol}</h2>
              <span
                className={`inline-flex rounded-[6px] border px-3 py-1 text-[11px] font-semibold ${
                  activeTrade.side === "LONG"
                    ? "border-mint bg-mint/15 text-mint"
                    : "border-coral bg-coral/15 text-coral"
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
              className="ui-button w-full text-sm sm:w-auto lg:shrink-0"
            >
              {pageMode ? "Back to Trades" : "Close"}
            </button>
        </div>

        <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
          {tradeDetailError && (
            <div className="ui-notice border-coral/20 bg-coral/10 text-coral">
              {tradeDetailError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric
              label="Trade P&L"
              value={formatCurrency(tradePnl)}
              accent={tradePnl >= 0 ? "text-mint" : "text-coral"}
            />
            <SummaryMetric label="Quantity" value={String(activeTrade.quantity)} />
            <SummaryMetric label="Hold Time" value={formatHoldTime(holdMinutes)} />
            <SummaryMetric label="Executions" value={String(executionCount)} />
          </div>

          <Card title="TRADER NOTES" className="dashboard-page-widget">
            <div className="space-y-5">
              {classifications ? <form className="space-y-4" onSubmit={handleSaveClassifications}>
                <TradeClassificationFields draft={classifications} onChange={setClassifications} review={review} busy={isSavingMeta} />
                {metaError && <p role="alert" className="text-sm text-coral">{metaError}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                  <button type="button" className="ui-button min-h-11 text-sm" disabled={isSavingMeta}
                    onClick={() => setClassifications(null)}>Cancel</button>
                  <button type="submit" className="ui-button-solid min-h-11 text-sm" disabled={isSavingMeta}>
                    {isSavingMeta ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form> : <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">Setups, tags and grade</h3>
                  <button type="button" className="ui-button min-h-11 text-sm" disabled={loadingTradeDetail}
                    onClick={() => { setMetaError(""); setClassifications(classificationDraft(activeTrade)); }}>
                    Edit classification
                  </button>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[["Setups", tradeSetups(activeTrade)], ["Tags", tradeTags(activeTrade)]].map(([label, values]) =>
                    <div key={label}>
                      <dt className="mb-1 text-sm text-mist">{label}</dt>
                      <dd className="flex flex-wrap gap-1.5">{values.length
                        ? values.map((name) => <span className="ui-chip max-w-full break-all" key={name}>{name}</span>)
                        : <span className="text-sm text-mist">None</span>}</dd>
                    </div>)}
                </dl>
                {review ? <SavedEntryGrade review={review} /> : <p className="text-sm text-mist">No entry grade</p>}
              </div>}

              <div className="ui-inset-box p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="ui-title text-xs text-white/48">Notes</p>
                  <button
                    type="button"
                    onClick={() => setIsNotesEditorOpen((current) => !current)}
                    className="ui-button px-3 py-2 text-xs"
                  >
                    {activeTrade.notes ? "Edit notes" : "Add notes"}
                  </button>
                </div>
                {isNotesEditorOpen ? (
                  <div id="trade-note-editor" className="mt-4 space-y-3">
                    <RichTextEditor
                      value={noteDraft}
                      onChange={setNoteDraft}
                      placeholder="Write your setup, thesis, execution review, and lessons here."
                      minHeight={220}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(activeTrade.notes || "");
                          setIsNotesEditorOpen(false);
                        }}
                        className="ui-button px-3 py-2 text-xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveNotes}
                        disabled={isSavingMeta}
                        className="ui-button-solid px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingMeta ? "Saving..." : "Save notes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="ui-inset-box mt-2 px-4 py-4">
                    {activeTrade.notes ? (
                      <div
                        className="prose prose-invert max-w-none text-sm leading-7 text-white/70"
                        dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(activeTrade.notes) }}
                      />
                    ) : (
                      <p className="text-sm leading-7 text-white/60">
                        No notes captured for this trade yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card title="Executions" className="dashboard-page-widget">
            <TimelineTable rows={tradeTimeline} />
          </Card>

          {activeTrade.exitDate && <TradeExitTiming key={`exit-timing-${activeTrade.id}`} tradeId={activeTrade.id} />}

          <TradeDisciplineCard key={`discipline-${activeTrade.id}`} trade={activeTrade}
            onUpdate={(analysis) => setEditableTrade((current) => ({ ...(current || activeTrade), analysis }))}
            onPlanUpdate={(values) => setEditableTrade((current) => {
              const base = current || activeTrade;
              return { ...base, entryReview: { ...base.entryReview, ...values } };
            })}
            onEditNotes={() => {
              setNoteDraft(activeTrade.notes || "");
              setIsNotesEditorOpen(true);
              requestAnimationFrame(() => document.getElementById("trade-note-editor")?.scrollIntoView({ block: "center" }));
            }} />
          <TradeIntelligenceCard key={activeTrade.id} trade={activeTrade}
            onApplySetup={handleSetSetup}
            onChange={(analysis) => setEditableTrade((current) => ({ ...(current || activeTrade), analysis }))} />

          <Card title="Execution Review Charts" className="dashboard-page-widget">
            <TradeReviewCharts trade={activeTrade} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              title="Trade Running P&L"
              subtitle="Realized progression across the executions we have stored for this trade."
              className="dashboard-page-widget"
            >
              {loadingTradeDetail ? (
                <LoadingState label="Loading trade detail..." className="min-h-[290px]" />
              ) : (
                <div className="pb-4" style={{ height: chartHeights.trade }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tradeRunningPnl} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                      <XAxis
                        type="number"
                        dataKey="timeValue"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={formatAxisTime}
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
                      <Tooltip content={<ChartTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke={tradePnl >= 0 ? "#34e0a1" : "#ff7e6b"}
                        strokeWidth={3}
                        dot={{ r: 4, strokeWidth: 0, fill: tradePnl >= 0 ? "#34e0a1" : "#ff7e6b" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Day Running P&L" className="dashboard-page-widget">
              {loadingDayTrades ? (
                <LoadingState label="Loading same-day trades..." className="min-h-[290px]" />
              ) : dayTradesError ? (
                <div className="flex h-[290px] items-center justify-center text-sm text-coral">
                  {dayTradesError}
                </div>
              ) : (
                <div className="pb-4" style={{ height: chartHeights.day }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={signedDayRunningPnl.data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                      <defs>
                        <linearGradient id="trade-day-pnl-fill-positive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(52, 224, 161, 0.34)" />
                          <stop offset="65%" stopColor="rgba(52, 224, 161, 0.12)" />
                          <stop offset="100%" stopColor="rgba(52, 224, 161, 0.02)" />
                        </linearGradient>
                        <linearGradient id="trade-day-pnl-fill-negative" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(255, 95, 122, 0.28)" />
                          <stop offset="65%" stopColor="rgba(255, 95, 122, 0.12)" />
                          <stop offset="100%" stopColor="rgba(255, 95, 122, 0.02)" />
                        </linearGradient>
                      </defs>
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
                      <Tooltip content={<ChartTooltip />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                      <ReferenceLine
                        y={0}
                        stroke="#ffffff"
                        strokeOpacity={0.72}
                        strokeWidth={1.5}
                        strokeDasharray="6 6"
                        ifOverflow="extendDomain"
                      />
                      <Area
                        type="monotone"
                        dataKey="positivePnl"
                        stroke="none"
                        fill="url(#trade-day-pnl-fill-positive)"
                        fillOpacity={1}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="negativePnl"
                        stroke="none"
                        fill="url(#trade-day-pnl-fill-negative)"
                        fillOpacity={1}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="positivePnl"
                        stroke="#34e0a1"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={false}
                        connectNulls={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="negativePnl"
                        stroke="#ff5f7a"
                        strokeWidth={3}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={false}
                        connectNulls={false}
                      />
                      {dayRunningPnl
                        .filter((point) => point.isSelected)
                        .map((point) => (
                          <ReferenceDot
                            key={point.id}
                            x={new Date(point.timestamp).getTime()}
                            y={point.pnl}
                            r={6}
                            fill={point.pnl >= 0 ? "#34e0a1" : "#ff5f7a"}
                            stroke="transparent"
                          />
                        ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
