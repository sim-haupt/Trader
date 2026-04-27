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
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
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

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function mergeTags(existingTags, nextTag) {
  return [...new Set([...parseTags(existingTags), nextTag])].join(", ");
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ui-chip-remove-icon h-3.5 w-3.5">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
  const value = Number(payload[0].value || 0);
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
  const data = points.map((point) => ({
    ...point,
    timeValue: new Date(point.timestamp).getTime(),
    positivePnl: point.pnl > 0 ? point.pnl : 0,
    negativePnl: point.pnl < 0 ? point.pnl : 0
  }));

  const segments = [];

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    const previousColor = previousPoint.pnl < 0 ? "#ff5f7a" : "#3dff9a";
    const currentColor = currentPoint.pnl < 0 ? "#ff5f7a" : "#3dff9a";

    segments.push({
      key: `horizontal-${index}`,
      color: previousColor,
      data: [
        { label: previousPoint.label, timeValue: new Date(previousPoint.timestamp).getTime(), pnl: previousPoint.pnl },
        { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: previousPoint.pnl }
      ]
    });

    if (previousPoint.pnl === currentPoint.pnl) {
      continue;
    }

    const crossedZero =
      (previousPoint.pnl < 0 && currentPoint.pnl >= 0) ||
      (previousPoint.pnl >= 0 && currentPoint.pnl < 0);

    if (crossedZero) {
      segments.push({
        key: `vertical-${index}-from`,
        color: previousColor,
        data: [
          { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: previousPoint.pnl },
          { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: 0 }
        ]
      });
      segments.push({
        key: `vertical-${index}-to`,
        color: currentColor,
        data: [
          { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: 0 },
          { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: currentPoint.pnl }
        ]
      });
      continue;
    }

    segments.push({
      key: `vertical-${index}`,
      color: currentColor,
      data: [
        { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: previousPoint.pnl },
        { label: currentPoint.label, timeValue: new Date(currentPoint.timestamp).getTime(), pnl: currentPoint.pnl }
      ]
    });
  }

  return { data, segments };
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
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);
  const [availableStrategies, setAvailableStrategies] = useState(
    () => strategyService.peekStrategies() || []
  );
  const [isStrategyEditorOpen, setIsStrategyEditorOpen] = useState(false);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [isNotesEditorOpen, setIsNotesEditorOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(trade.notes || "");
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  useEffect(() => {
    const nextTrade = tradeDetail || trade;
    setEditableTrade(nextTrade);
    setNoteDraft(nextTrade.notes || "");
  }, [trade, tradeDetail]);

  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        const tags = await tagService.getTags();

        if (!cancelled) {
          setAvailableTags(tags);
        }
      } catch {
        if (!cancelled) {
          setAvailableTags([]);
        }
      }
    }

    loadTags();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStrategies() {
      try {
        const strategies = await strategyService.getStrategies();

        if (!cancelled) {
          setAvailableStrategies(strategies);
        }
      } catch {
        if (!cancelled) {
          setAvailableStrategies([]);
        }
      }
    }

    loadStrategies();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const activeTrade = editableTrade || tradeDetail || trade;
  const tradePnl = getTradePnl(activeTrade);
  const holdMinutes = getTradeHoldMinutes(activeTrade);
  const executionCount = getDisplayedExecutionCount(activeTrade);
  const tradeRunningPnl = useMemo(() => buildTradeRunningPnl(activeTrade), [activeTrade]);
  const tradeTimeline = useMemo(() => buildTradeTimeline(activeTrade), [activeTrade]);
  const dayRunningPnl = useMemo(
    () => buildDayRunningPnl(activeTrade, dayTrades),
    [activeTrade, dayTrades]
  );
  const signedDayRunningPnl = useMemo(() => buildSignedChartSeries(dayRunningPnl), [dayRunningPnl]);
  const activeTags = useMemo(() => parseTags(activeTrade.tags), [activeTrade.tags]);
  const activeStrategy = useMemo(() => String(activeTrade.strategy || "").trim(), [activeTrade.strategy]);
  const tagSuggestions = useMemo(() => {
    const current = new Set(activeTags.map((tag) => tag.toLowerCase()));

    return availableTags.filter((tag) => {
      const tagName = typeof tag === "string" ? tag : tag.name;

      if (current.has(tagName.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [activeTags, availableTags]);
  const strategySuggestions = useMemo(
    () =>
      availableStrategies.filter(
        (strategy) =>
          String(strategy.name || "").trim().toLowerCase() !== activeStrategy.toLowerCase()
      ),
    [availableStrategies, activeStrategy]
  );

  async function refreshAvailableTags() {
    const tags = await tagService.getTags({ forceRefresh: true });
    setAvailableTags(tags);
  }

  async function refreshAvailableStrategies() {
    const strategies = await strategyService.getStrategies({ forceRefresh: true });
    setAvailableStrategies(strategies);
  }

  async function handleAddTag(tagValue) {
    const nextTag = tagValue.trim();

    if (!nextTag || activeTags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) {
      return;
    }

    const optimisticTrade = {
      ...activeTrade,
      tags: mergeTags(activeTrade.tags, nextTag)
    };

    setEditableTrade(optimisticTrade);
    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        tags: nextTag,
        tagsMode: "append"
      });

      setEditableTrade(updatedTrade);
      await refreshAvailableTags();
    } catch (error) {
      setEditableTrade(activeTrade);
      throw error;
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleRemoveTag(tagValue) {
    const remainingTags = activeTags.filter((tag) => tag !== tagValue).join(", ");

    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        tags: remainingTags,
        tagsMode: "replace"
      });

      setEditableTrade(updatedTrade);
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleSetStrategy(strategyValue) {
    const nextStrategy = String(strategyValue || "").trim();

    if (!nextStrategy || nextStrategy.toLowerCase() === activeStrategy.toLowerCase()) {
      return;
    }

    setEditableTrade({
      ...activeTrade,
      strategy: nextStrategy
    });
    setIsStrategyEditorOpen(false);
    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        strategy: nextStrategy
      });

      setEditableTrade(updatedTrade);
      await refreshAvailableStrategies();
    } catch (error) {
      setEditableTrade(activeTrade);
      throw error;
    } finally {
      setIsSavingMeta(false);
    }
  }

  async function handleRemoveStrategy() {
    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        strategy: ""
      });

      setEditableTrade(updatedTrade);
    } finally {
      setIsSavingMeta(false);
    }
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
          ? "w-full"
          : "fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/80 px-4 pb-4 pt-0 backdrop-blur"
      }
    >
      <div
        className={`w-full max-w-[1520px] border border-[#e5e7eb42] bg-black ${
          pageMode ? "rounded-[6px]" : "rounded-[6px]"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e5e7eb42] bg-black px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-4xl font-bold tracking-[-0.05em] text-white">{activeTrade.symbol}</h2>
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
              className="ui-button text-sm"
            >
              {pageMode ? "Back to Trades" : "Close"}
            </button>
        </div>

        <div className="space-y-6 p-6">
          {tradeDetailError && (
            <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">
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

          <Card title="TRADER NOTES">
            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="ui-inset-box p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="ui-title text-xs text-white/48">Strategy</p>
                  <button
                    type="button"
                    onClick={() => setIsStrategyEditorOpen((current) => !current)}
                    className="ui-button px-3 py-2 text-xs"
                  >
                    Add strategy
                  </button>
                </div>
                {activeStrategy ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRemoveStrategy}
                      className="ui-chip-removable"
                    >
                      <span>{activeStrategy}</span>
                      <RemoveIcon />
                    </button>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-phosphor">No strategy selected</p>
                )}

                {isStrategyEditorOpen && (
                  <div className="mt-4 space-y-3">
                    {strategySuggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {strategySuggestions.map((strategy) => (
                          <button
                            key={strategy.id}
                            type="button"
                            onClick={() => handleSetStrategy(strategy.name)}
                            className="ui-button px-3 py-1.5 text-xs"
                          >
                            {strategy.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/48">
                        No more saved strategies available. Add new ones from Settings.
                      </div>
                    )}
                  </div>
                )}
                </div>

                <div className="ui-inset-box p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="ui-title text-xs text-white/48">Tags</p>
                  <button
                    type="button"
                    onClick={() => setIsTagEditorOpen((current) => !current)}
                    className="ui-button px-3 py-2 text-xs"
                  >
                    Add tags
                  </button>
                </div>
                {activeTags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ui-chip-removable"
                      >
                        <span>{tag}</span>
                        <RemoveIcon />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-phosphor">No tags added</p>
                )}

                {isTagEditorOpen && (
                  <div className="mt-4 space-y-3">
                    {tagSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tagSuggestions.map((tag) => {
                          const tagName = typeof tag === "string" ? tag : tag.name;

                          return (
                            <button
                              key={tagName}
                              type="button"
                              onClick={() => handleAddTag(tagName)}
                              className="ui-button px-3 py-1.5 text-xs"
                            >
                              {tagName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {tagSuggestions.length === 0 ? (
                      <div className="text-xs text-white/48">
                        No more saved tags available. Add new ones from Settings.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              </div>

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
                  <div className="mt-4 space-y-3">
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

          <Card title="Executions">
            <TimelineTable rows={tradeTimeline} />
          </Card>

          <Card title="Execution Review Charts">
            <TradeReviewCharts trade={activeTrade} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card
              title="Trade Running P&L"
              subtitle="Realized progression across the executions we have stored for this trade."
            >
              {loadingTradeDetail ? (
                <LoadingState label="Loading trade detail..." className="min-h-[290px]" />
              ) : (
                <div className="h-[290px] pb-4">
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
                <LoadingState label="Loading same-day trades..." className="min-h-[290px]" />
              ) : dayTradesError ? (
                <div className="flex h-[290px] items-center justify-center text-sm text-coral">
                  {dayTradesError}
                </div>
              ) : (
                <div className="h-[290px] pb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={signedDayRunningPnl.data} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
                      <defs>
                        <linearGradient id="trade-day-pnl-fill-positive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(61, 255, 154, 0.34)" />
                          <stop offset="65%" stopColor="rgba(61, 255, 154, 0.12)" />
                          <stop offset="100%" stopColor="rgba(61, 255, 154, 0.02)" />
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
                      {signedDayRunningPnl.segments.map((segment) => (
                        <Line
                          key={segment.key}
                          type="linear"
                          data={segment.data}
                          dataKey="pnl"
                          stroke={segment.color}
                          strokeWidth={3}
                          dot={false}
                          isAnimationActive={false}
                          activeDot={false}
                          legendType="none"
                          connectNulls
                        />
                      ))}
                      {dayRunningPnl
                        .filter((point) => point.isSelected)
                        .map((point) => (
                          <ReferenceDot
                            key={point.id}
                            x={new Date(point.timestamp).getTime()}
                            y={point.pnl}
                            r={6}
                            fill={point.pnl >= 0 ? "#3dff9a" : "#ff5f7a"}
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
