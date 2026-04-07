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

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderSimpleMarkdown(value) {
  const escaped = escapeHtml(value);
  const lines = escaped.split("\n");
  const html = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }

      const item = line.replace(/^\s*[-*]\s+/, "");
      html.push(`<li>${formatInlineMarkdown(item)}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }

    if (!line.trim()) {
      html.push("<br />");
      continue;
    }

    html.push(`<p>${formatInlineMarkdown(line)}</p>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  return html.join("");
}

function formatInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function SummaryMetric({ label, value, accent = "text-white" }) {
  return (
    <div className="rounded-[18px] border border-[#e5e7eb42] bg-white/[0.03] p-4">
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
    <div className="rounded-2xl border border-[#e5e7eb42] bg-[#0d1016]/95 px-3 py-2 text-xs text-phosphor shadow-[0_20px_50px_rgba(0,0,0,0.42)]">
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
  const [editableTrade, setEditableTrade] = useState(trade);
  const [availableTags, setAvailableTags] = useState(() => tagService.peekTags() || []);
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

  async function refreshAvailableTags() {
    const tags = await tagService.getTags({ forceRefresh: true });
    setAvailableTags(tags);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur">
      <div className="w-full max-w-[1520px] rounded-[30px] border border-[#e5e7eb42] bg-[linear-gradient(180deg,rgba(16,19,26,0.98),rgba(9,11,16,0.98))] shadow-glow">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e5e7eb42] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] px-6 py-5 backdrop-blur">
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

          <Card title="TRADER NOTES">
            <div className="space-y-5">
              <div className="rounded-[18px] border border-[#e5e7eb42] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="ui-title text-xs text-white/48">Tags</p>
                  <button
                    type="button"
                    onClick={() => setIsTagEditorOpen((current) => !current)}
                    className="ui-button px-3 py-2 text-xs"
                  >
                    Select tags
                  </button>
                </div>
                {activeTags.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/78"
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

              <div className="rounded-[18px] border border-[#e5e7eb42] bg-white/[0.03] p-4">
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
                    <textarea
                      rows="7"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Write your setup, thesis, execution review, and lessons here..."
                      className="ui-input"
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
                  <div className="mt-2 rounded-[16px] border border-[#e5e7eb33] bg-black/10 px-4 py-4">
                    {activeTrade.notes ? (
                      <div
                        className="prose prose-invert max-w-none text-sm leading-7 text-white/70"
                        dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(activeTrade.notes) }}
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

          <div className="grid gap-6 xl:grid-cols-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default TradeDetailModal;
