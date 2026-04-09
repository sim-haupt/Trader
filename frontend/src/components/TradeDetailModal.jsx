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

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-xs text-phosphor">
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
    () => availableStrategies.filter((strategy) => strategy.name !== activeStrategy),
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

    if (!nextTag) {
      return;
    }

    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        tags: nextTag,
        tagsMode: "append"
      });

      setEditableTrade(updatedTrade);
      await refreshAvailableTags();
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
    setIsSavingMeta(true);

    try {
      const updatedTrade = await tradeService.updateTradeMeta(activeTrade.id, {
        strategy: strategyValue
      });

      setEditableTrade(updatedTrade);
      await refreshAvailableStrategies();
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
                      className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--line)] bg-black px-3 py-1 text-xs text-white/78"
                    >
                      <span>{activeStrategy}</span>
                      <span className="text-white/45">x</span>
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
                        className="inline-flex items-center gap-2 rounded-[6px] border border-[var(--line)] bg-black px-3 py-1 text-xs text-white/78"
                      >
                        <span>{tag}</span>
                        <span className="text-white/45">x</span>
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
                    <LineChart data={dayRunningPnl} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
