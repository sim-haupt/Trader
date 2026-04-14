import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import Filters from "../components/Filters";
import LoadingState from "../components/ui/LoadingState";
import RichTextEditor from "../components/ui/RichTextEditor";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import journalService from "../services/journalService";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import { formatCurrency, formatDateTimeLocal } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { getTradeFeeDisplayValue, getTradeNetPnl } from "../utils/tradePnl";
import { normalizeRichTextHtml } from "../utils/richText";

const PAGE_SIZE = 5;
const JOURNAL_TIMELINE_PADDING_SECONDS = 2 * 60 * 60;
const DAY_START_SECONDS = 0;
const DAY_END_SECONDS = 24 * 60 * 60 - 1;
const EMPTY_DAY_TIMELINE_START_SECONDS = 4 * 60 * 60;
const EMPTY_DAY_TIMELINE_END_SECONDS = 20 * 60 * 60;

function getDayKey(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(0, 10) : "";
}

function parseDayKey(dayKey) {
  const match = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day)
  };
}

function addDays(dayKey, amount) {
  const parts = parseDayKey(dayKey);
  if (!parts) {
    return dayKey;
  }

  // Use UTC math so "YYYY-MM-DD" always moves forward regardless of local / market timezone.
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const next = new Date(utc + (Number(amount) || 0) * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function enumerateDayKeys(startKey, endKey) {
  if (!startKey || !endKey || startKey > endKey) {
    return [];
  }

  const keys = [];
  let cursor = startKey;
  let safety = 0;

  while (cursor <= endKey) {
    keys.push(cursor);
    const next = addDays(cursor, 1);
    if (next === cursor) {
      break;
    }
    cursor = next;
    safety += 1;
    if (safety > 5000) {
      break;
    }
  }

  return keys;
}

function formatDayLabel(dayKey) {
  const date = new Date(`${dayKey}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  })
    .format(date)
    .toUpperCase();
}

function formatTimeLabel(value) {
  const formatted = formatDateTimeLocal(value);
  return formatted ? formatted.slice(11, 19) : "--:--:--";
}

function getSessionSeconds(value) {
  const timeLabel = formatTimeLabel(value);

  if (!timeLabel || timeLabel === "--:--:--") {
    return DAY_START_SECONDS;
  }

  const [hours = 0, minutes = 0, seconds = 0] = timeLabel.split(":").map((part) => Number(part) || 0);
  const totalSeconds = hours * 60 * 60 + minutes * 60 + seconds;

  return Math.max(DAY_START_SECONDS, Math.min(DAY_END_SECONDS, totalSeconds));
}

function formatSessionAxisTime(totalSeconds) {
  const normalized = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildJournalTimeTicks(startSeconds, endSeconds) {
  const safeStart = Math.max(DAY_START_SECONDS, Math.min(DAY_END_SECONDS, Number(startSeconds) || 0));
  const safeEnd = Math.max(safeStart, Math.min(DAY_END_SECONDS, Number(endSeconds) || safeStart));
  const range = safeEnd - safeStart;
  const step = range <= 6 * 60 * 60 ? 30 * 60 : 60 * 60;
  const ticks = [safeStart];
  let nextTick = Math.ceil(safeStart / step) * step;

  while (nextTick < safeEnd) {
    if (nextTick > safeStart) {
      ticks.push(nextTick);
    }

    nextTick += step;
  }

  if (ticks[ticks.length - 1] !== safeEnd) {
    ticks.push(safeEnd);
  }

  return [...new Set(ticks)];
}

function getTradeTags(trade) {
  return String(trade.tags || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTradePnl(trade, defaultCommission, defaultFees) {
  return getTradeNetPnl(trade, defaultCommission, defaultFees);
}

function matchesTradeFilters(trade, filters) {
  const symbol = String(trade.symbol || "").toUpperCase();
  const strategy = String(trade.strategy || "").trim();
  const side = String(trade.side || "").toUpperCase();
  const dayKey = getDayKey(trade.entryDate);
  const tags = getTradeTags(trade);

  if (filters.symbol && !symbol.includes(filters.symbol.trim().toUpperCase())) {
    return false;
  }

  if (filters.tag && !tags.some((tag) => tag.toLowerCase() === String(filters.tag).toLowerCase())) {
    return false;
  }

  if (filters.strategy && strategy !== filters.strategy) {
    return false;
  }

  if (filters.side && side !== filters.side) {
    return false;
  }

  if (filters.from && dayKey < filters.from) {
    return false;
  }

  if (filters.to && dayKey > filters.to) {
    return false;
  }

  return true;
}

function matchesJournalDayRange(dayKey, filters) {
  if (!dayKey) {
    return false;
  }

  if (filters.from && dayKey < filters.from) {
    return false;
  }

  if (filters.to && dayKey > filters.to) {
    return false;
  }

  return true;
}

function buildJournalVisualization(dayKey, trades) {
  const sortedTrades = [...trades].sort(
    (left, right) => new Date(left.entryDate).getTime() - new Date(right.entryDate).getTime()
  );

  if (sortedTrades.length === 0) {
    const timelineStart = EMPTY_DAY_TIMELINE_START_SECONDS;
    const timelineEnd = EMPTY_DAY_TIMELINE_END_SECONDS;

    return {
      trades: sortedTrades,
      timelineStart,
      timelineEnd,
      timeTicks: buildJournalTimeTicks(timelineStart, timelineEnd),
      chartData: [
        {
          timeValue: timelineStart,
          timeLabel: formatSessionAxisTime(timelineStart),
          cumulative: 0,
          positiveCumulative: 0,
          negativeCumulative: null,
          isTrade: false
        },
        {
          timeValue: timelineEnd,
          timeLabel: formatSessionAxisTime(timelineEnd),
          cumulative: 0,
          positiveCumulative: 0,
          negativeCumulative: null,
          isTrade: false
        }
      ],
      chartSegments: [
        {
          key: `${dayKey}-empty`,
          color: "#3dff9a",
          data: [
            {
              timeValue: timelineStart,
              segmentValue: 0
            },
            {
              timeValue: timelineEnd,
              segmentValue: 0
            }
          ]
        }
      ]
    };
  }

  let cumulative = 0;
  const tradeTimeValues = sortedTrades.map((trade) => getSessionSeconds(trade.entryDate));
  const firstTradeTime = tradeTimeValues[0];
  const lastTradeTime = tradeTimeValues[tradeTimeValues.length - 1];
  const timelineStart = Math.max(DAY_START_SECONDS, firstTradeTime - JOURNAL_TIMELINE_PADDING_SECONDS);
  const timelineEnd = Math.min(DAY_END_SECONDS, lastTradeTime + JOURNAL_TIMELINE_PADDING_SECONDS);
  const timeTicks = buildJournalTimeTicks(timelineStart, timelineEnd);

  const chartData = [
    {
      timeValue: timelineStart,
      timeLabel: formatSessionAxisTime(timelineStart),
      cumulative: 0,
      isTrade: false
    }
  ];

  for (let tradeIndex = 0; tradeIndex < sortedTrades.length; tradeIndex += 1) {
    const trade = sortedTrades[tradeIndex];
    const tradeTimeSeconds = tradeTimeValues[tradeIndex];

    chartData.push({
      timeValue: tradeTimeSeconds,
      timeLabel: trade.entryTimeLabel,
      cumulative: Number(cumulative.toFixed(2)),
      isTrade: false
    });

    cumulative += trade.dayPnl;

    chartData.push({
      timeValue: Math.min(tradeTimeSeconds + 1, timelineEnd),
      timeLabel: trade.entryTimeLabel,
      cumulative: Number(cumulative.toFixed(2)),
      isTrade: true
    });
  }

  chartData.push({
    timeValue: timelineEnd,
    timeLabel: formatSessionAxisTime(timelineEnd),
    cumulative: Number(cumulative.toFixed(2)),
    isTrade: false
  });

  const chartSeries = chartData.map((point) => ({
    ...point,
    positiveCumulative: point.cumulative >= 0 ? point.cumulative : null,
    negativeCumulative: point.cumulative < 0 ? point.cumulative : null
  }));

  const chartSegments = [];

  for (let index = 1; index < chartSeries.length; index += 1) {
    const previousPoint = chartSeries[index - 1];
    const currentPoint = chartSeries[index];
    const previousColor = previousPoint.cumulative < 0 ? "#ff5f7a" : "#3dff9a";
    const currentColor = currentPoint.cumulative < 0 ? "#ff5f7a" : "#3dff9a";

    chartSegments.push({
      key: `${dayKey}-horizontal-${index}`,
      color: previousColor,
      data: [
        {
          timeValue: previousPoint.timeValue,
          segmentValue: previousPoint.cumulative
        },
        {
          timeValue: currentPoint.timeValue,
          segmentValue: previousPoint.cumulative
        }
      ]
    });

    if (previousPoint.cumulative === currentPoint.cumulative) {
      continue;
    }

    const crossedZero =
      (previousPoint.cumulative < 0 && currentPoint.cumulative >= 0) ||
      (previousPoint.cumulative >= 0 && currentPoint.cumulative < 0);

    if (crossedZero) {
      chartSegments.push({
        key: `${dayKey}-vertical-${index}-from`,
        color: previousColor,
        data: [
          {
            timeValue: currentPoint.timeValue,
            segmentValue: previousPoint.cumulative
          },
          {
            timeValue: currentPoint.timeValue,
            segmentValue: 0
          }
        ]
      });

      chartSegments.push({
        key: `${dayKey}-vertical-${index}-to`,
        color: currentColor,
        data: [
          {
            timeValue: currentPoint.timeValue,
            segmentValue: 0
          },
          {
            timeValue: currentPoint.timeValue,
            segmentValue: currentPoint.cumulative
          }
        ]
      });
      continue;
    }

    chartSegments.push({
      key: `${dayKey}-vertical-${index}`,
      color: currentColor,
      data: [
        {
          timeValue: currentPoint.timeValue,
          segmentValue: previousPoint.cumulative
        },
        {
          timeValue: currentPoint.timeValue,
          segmentValue: currentPoint.cumulative
        }
      ]
    });
  }

  return {
    trades: sortedTrades,
    chartData: chartSeries,
    chartSegments,
    timelineStart,
    timelineEnd,
    timeTicks
  };
}

function buildDailyJournal(trades, dayNotes, defaultCommission, defaultFees, includeDayKeys = []) {
  const grouped = new Map();

  for (const trade of trades) {
    const dayKey = getDayKey(trade.entryDate);

    if (!dayKey) {
      continue;
    }

    const pnl = buildTradePnl(trade, defaultCommission, defaultFees);
    const quantity = Number(trade.quantity || 0);
    const fees = getTradeFeeDisplayValue(trade, defaultCommission, defaultFees);
    const existing = grouped.get(dayKey) || {
      dayKey,
      label: formatDayLabel(dayKey),
      trades: [],
      totalTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      totalPnl: 0,
      wins: 0,
      losses: 0
    };

    existing.trades.push({
      ...trade,
      dayPnl: pnl,
      entryTimeLabel: formatTimeLabel(trade.entryDate),
      execCount: trade.reportedExecutionCount ?? trade.executions?.length ?? 0,
      parsedTags: getTradeTags(trade)
    });
    existing.totalTrades += 1;
    existing.totalVolume += quantity;
    existing.totalFees += fees;
    existing.totalPnl += pnl;

    if (pnl > 0) {
      existing.wins += 1;
    } else if (pnl < 0) {
      existing.losses += 1;
    }

    grouped.set(dayKey, existing);
  }

  for (const dayKey of includeDayKeys) {
    if (!dayKey || grouped.has(dayKey)) {
      continue;
    }

    grouped.set(dayKey, {
      dayKey,
      label: formatDayLabel(dayKey),
      trades: [],
      totalTrades: 0,
      totalVolume: 0,
      totalFees: 0,
      totalPnl: 0,
      wins: 0,
      losses: 0
    });
  }

  return [...grouped.values()]
    .map((day) => {
      const visualization = buildJournalVisualization(day.dayKey, day.trades);

      return {
        ...day,
        trades: visualization.trades,
        chartData: visualization.chartData,
        chartSegments: visualization.chartSegments,
        timelineStart: visualization.timelineStart,
        timelineEnd: visualization.timelineEnd,
        timeTicks: visualization.timeTicks,
        totalPnl: Number(day.totalPnl.toFixed(2)),
        totalFees: Number(day.totalFees.toFixed(2)),
        winRate: day.totalTrades ? (day.wins / day.totalTrades) * 100 : 0,
        note: dayNotes.get(day.dayKey)?.notes || ""
      };
    })
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function JournalChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const timeLabel = point?.timeLabel || formatSessionAxisTime(label);

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-xs text-white">
      <div className="text-white/52">{timeLabel}</div>
      <div className="mt-1 font-medium text-white">{formatCurrency(payload[0].value)}</div>
    </div>
  );
}

function JournalDayCard({
  day,
  noteDraft,
  onNoteChange,
  onSaveNote,
  onStartEditingNote,
  onCancelEditingNote,
  isEditingNote,
  isSaving,
  onOpenTrade
}) {
  const positive = day.totalPnl >= 0;
  const negative = day.totalPnl < 0;
  const hasTrades = day.totalTrades > 0;
  const winRateClass =
    day.winRate < 50 ? "text-coral" : day.winRate <= 65 ? "text-gold" : "text-mint";

  return (
    <Card
      title={<span className="text-[14px] text-white/72">{day.label}</span>}
      action={
        <div
          className={`rounded-[6px] border px-3 py-2 text-sm font-semibold ${
            positive
              ? "border-mint bg-mint/10 text-mint"
              : negative
                ? "border-coral bg-[#1b1012] text-coral"
                : "border-[#e5e7eb42] bg-white/[0.05] text-mist"
          }`}
        >
          P&amp;L: {formatCurrency(day.totalPnl)}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="h-[180px] rounded-[6px] border border-[var(--line)] bg-black p-3 pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={day.chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 16 }}
              >
                <defs>
                  <linearGradient id={`journal-${day.dayKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3dff9a" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#3dff9a" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id={`journal-negative-${day.dayKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff5f7a" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#ff5f7a" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis
                  type="number"
                  dataKey="timeValue"
                  domain={[day.timelineStart, day.timelineEnd]}
                  ticks={day.timeTicks}
                  tickFormatter={formatSessionAxisTime}
                  tick={{ fill: "#9aa4b7", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tickFormatter={(value) => `$${value}`} tick={{ fill: "#9aa4b7", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip content={<JournalChartTooltip />} />
                <Area
                  type="stepAfter"
                  dataKey="positiveCumulative"
                  stroke="none"
                  fill={`url(#journal-${day.dayKey})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                <Area
                  type="stepAfter"
                  dataKey="negativeCumulative"
                  stroke="none"
                  fill={`url(#journal-negative-${day.dayKey})`}
                  isAnimationActive={false}
                  activeDot={false}
                />
                {day.chartSegments.map((segment) => (
                  <Line
                    key={segment.key}
                    data={segment.data}
                    type="linear"
                    dataKey="segmentValue"
                    stroke={segment.color}
                    strokeWidth={2.3}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                ))}
                <Area
                  type="stepAfter"
                  dataKey="cumulative"
                  stroke="transparent"
                  strokeWidth={0}
                  fill={`url(#journal-${day.dayKey})`}
                  fillOpacity={0}
                  isAnimationActive={false}
                  dot={(props) => {
                    if (!props.payload?.isTrade) {
                      return null;
                    }

                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={3}
                        fill={props.payload.cumulative < 0 ? "#ff5f7a" : "#3dff9a"}
                        stroke="#000000"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={(props) => {
                    if (!props.payload?.isTrade) {
                      return null;
                    }

                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={4}
                        fill={props.payload.cumulative < 0 ? "#ff5f7a" : "#3dff9a"}
                        stroke="#000000"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Trades</div>
              <div className="mt-2 text-2xl font-semibold text-white">{day.totalTrades}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Win %</div>
              <div className={`mt-2 text-2xl font-semibold ${hasTrades ? winRateClass : "text-white"}`}>
                {hasTrades ? `${day.winRate.toFixed(1)}%` : "No trades"}
              </div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Total Volume</div>
              <div className="mt-2 text-2xl font-semibold text-white">{Math.round(day.totalVolume).toLocaleString()}</div>
            </div>
            <div className="ui-metric-tile">
              <div className="ui-title text-[10px] text-white/52">Commissions/Fees</div>
              <div className="mt-2 text-2xl font-semibold text-white">{formatCurrency(day.totalFees)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[6px] border border-[var(--line)] bg-[rgba(255,255,255,0.05)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="ui-title inline-flex min-h-[36px] items-center text-[10px] leading-none text-white/56">
              Day Notes
            </div>
            {!isEditingNote ? (
              <button
                type="button"
                onClick={() => onStartEditingNote(day.dayKey)}
                className="ui-button px-4 py-2 text-xs"
              >
                {day.note ? "Edit notes" : "Add notes"}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCancelEditingNote(day.dayKey, day.note || "")}
                  className="ui-button px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onSaveNote(day.dayKey)}
                  disabled={isSaving}
                  className="ui-button-solid px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save notes"}
                </button>
              </div>
            )}
          </div>

          {isEditingNote ? (
            <RichTextEditor
              value={noteDraft}
              onChange={(value) => onNoteChange(day.dayKey, value)}
              placeholder="Write your review, mistakes, strengths, and lessons from this trading day..."
              minHeight={180}
            />
          ) : day.note ? (
            <div className="rounded-[6px] border border-[var(--line)] bg-black px-4 py-4">
              <div
                className="prose prose-invert max-w-none text-sm text-white/72"
                dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(day.note) }}
              />
            </div>
          ) : (
            <div className="rounded-[6px] border border-dashed border-[var(--line)] bg-black px-4 py-5 text-sm text-white/40">
              No notes captured for this trading day yet.
            </div>
          )}
        </div>

        <div className="ui-table-shell overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/[0.03] text-left text-white/56">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Volume</th>
                  <th className="px-4 py-3 font-medium">Execs</th>
                  <th className="px-4 py-3 font-medium">P&amp;L</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {day.trades.length > 0 ? (
                  day.trades.map((trade) => (
                    <tr
                      key={trade.id}
                      className="cursor-pointer border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)] text-white/82 transition hover:bg-white/[0.08]"
                      onClick={() => onOpenTrade(trade.id)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{trade.entryTimeLabel}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{trade.symbol}</div>
                        {trade.strategy ? <div className="mt-1 text-xs text-white/50">{trade.strategy}</div> : null}
                      </td>
                      <td className="px-4 py-3">{Math.round(Number(trade.quantity || 0)).toLocaleString()}</td>
                      <td className="px-4 py-3">{trade.execCount}</td>
                      <td className={`px-4 py-3 font-medium ${trade.dayPnl > 0 ? "text-mint" : trade.dayPnl < 0 ? "text-coral" : "text-white/70"}`}>
                        {formatCurrency(trade.dayPnl)}
                      </td>
                      <td className="px-4 py-3 text-white/54">
                        {trade.strategy ? trade.strategy : <span className="text-white/26">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {trade.parsedTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {trade.parsedTags.map((tag) => (
                              <span key={`${trade.id}-${tag}`} className="ui-chip">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/26">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-[var(--line)] bg-[rgba(255,255,255,0.05)]">
                    <td colSpan={7} className="px-4 py-5 text-sm text-white/40">
                      No trades logged for this day.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function JournalPage() {
  const { user } = useAuth();
  const { notify } = useNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDay = searchParams.get("day") || "";
  const [filters, setFilters] = useState({
    symbol: "",
    tag: "",
    strategy: "",
    side: "",
    from: selectedDay,
    to: selectedDay,
    hideNoTradeDays: false
  });
  const [page, setPage] = useState(1);
  const [draftNotes, setDraftNotes] = useState({});
  const [editingNotesByDay, setEditingNotesByDay] = useState({});
  const [savingDayKey, setSavingDayKey] = useState("");

  const tradesResource = useCachedAsyncResource({
    peek: () => tradeService.peekAllTrades(),
    load: () => tradeService.getAllTrades(),
    initialValue: [],
    deps: []
  });

  const journalDaysResource = useCachedAsyncResource({
    peek: () => journalService.peekJournalDays(),
    load: () => journalService.getJournalDays(),
    initialValue: [],
    deps: []
  });

  const tagsResource = useCachedAsyncResource({
    peek: () => tagService.peekTags(),
    load: () => tagService.getTags(),
    initialValue: [],
    deps: []
  });

  const strategiesResource = useCachedAsyncResource({
    peek: () => strategyService.peekStrategies(),
    load: () => strategyService.getStrategies(),
    initialValue: [],
    deps: []
  });

  useEffect(() => {
    if (!selectedDay) {
      return;
    }

    setFilters((current) => ({
      ...current,
      from: selectedDay,
      to: selectedDay
    }));
    setPage(1);
  }, [selectedDay]);

  useEffect(() => {
    const nextDrafts = {};

    for (const day of journalDaysResource.data) {
      nextDrafts[day.dayKey] = day.notes || "";
    }

    setDraftNotes((current) => ({
      ...current,
      ...nextDrafts
    }));
  }, [journalDaysResource.data]);

  const filteredTrades = useMemo(
    () => tradesResource.data.filter((trade) => matchesTradeFilters(trade, filters)),
    [tradesResource.data, filters]
  );

  const journalDayKeys = useMemo(() => {
    const todayKey = getDayKey(new Date());
    const hasTradeSpecificFilters = Boolean(
      filters.symbol || filters.tag || filters.strategy || filters.side
    );

    // If you filter by ticker/tag/strategy/side, default to hiding empty days (matches your request).
    const hideNoTradeDays = Boolean(filters.hideNoTradeDays || hasTradeSpecificFilters);

    const allTradeDayKeys = tradesResource.data.map((trade) => getDayKey(trade.entryDate)).filter(Boolean);
    allTradeDayKeys.sort();
    const earliestTradeDayKey = allTradeDayKeys[0] || todayKey;
    const latestTradeDayKey = allTradeDayKeys[allTradeDayKeys.length - 1] || todayKey;

    const noteDayKeys = journalDaysResource.data.map((day) => day.dayKey).filter(Boolean);
    noteDayKeys.sort();
    const earliestNoteDayKey = noteDayKeys[0] || earliestTradeDayKey;
    const latestNoteDayKey = noteDayKeys[noteDayKeys.length - 1] || latestTradeDayKey;

    // Default range is: first trade day (or first note day) -> today.
    const defaultStart = earliestTradeDayKey < earliestNoteDayKey ? earliestTradeDayKey : earliestNoteDayKey;
    const defaultEnd = latestTradeDayKey > latestNoteDayKey ? latestTradeDayKey : latestNoteDayKey;
    const startKey = filters.from || defaultStart || todayKey;
    const endKey = filters.to || (defaultEnd > todayKey ? defaultEnd : todayKey);

    if (hideNoTradeDays) {
      const tradeKeysInRange = [...new Set(filteredTrades.map((trade) => getDayKey(trade.entryDate)).filter(Boolean))]
        .filter((dayKey) => matchesJournalDayRange(dayKey, { from: startKey, to: endKey }))
        .sort((left, right) => right.localeCompare(left));
      return tradeKeysInRange;
    }

    return enumerateDayKeys(startKey, endKey).sort((left, right) => right.localeCompare(left));
  }, [
    tradesResource.data,
    filteredTrades,
    journalDaysResource.data,
    filters.symbol,
    filters.tag,
    filters.strategy,
    filters.side,
    filters.from,
    filters.to,
    filters.hideNoTradeDays
  ]);

  const totalPages = Math.max(1, Math.ceil(journalDayKeys.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedDayKeys = useMemo(
    () => journalDayKeys.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [journalDayKeys, currentPage]
  );

  const pagedDays = useMemo(() => {
    const notesByDay = new Map(journalDaysResource.data.map((day) => [day.dayKey, day]));
    const pagedSet = new Set(pagedDayKeys);
    const tradesForPage = filteredTrades.filter((trade) => pagedSet.has(getDayKey(trade.entryDate)));

    return buildDailyJournal(
      tradesForPage,
      notesByDay,
      user?.defaultCommission ?? 0,
      user?.defaultFees ?? 0,
      pagedDayKeys
    );
  }, [
    filteredTrades,
    journalDaysResource.data,
    user?.defaultCommission,
    user?.defaultFees,
    pagedDayKeys
  ]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(journalDayKeys.length / PAGE_SIZE))));
  }, [journalDayKeys.length]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function handleResetFilters() {
    setFilters({
      symbol: "",
      tag: "",
      strategy: "",
      side: "",
      from: "",
      to: "",
      hideNoTradeDays: false
    });
    setSearchParams({});
    setPage(1);
  }

  function handleNotesChange(dayKey, value) {
    setDraftNotes((current) => ({
      ...current,
      [dayKey]: value
    }));
  }

  function handleStartEditingDay(dayKey) {
    setEditingNotesByDay((current) => ({
      ...current,
      [dayKey]: true
    }));
  }

  function handleCancelEditingDay(dayKey, value) {
    setDraftNotes((current) => ({
      ...current,
      [dayKey]: value
    }));
    setEditingNotesByDay((current) => ({
      ...current,
      [dayKey]: false
    }));
  }

  async function handleSaveDay(dayKey) {
    setSavingDayKey(dayKey);

    try {
      await journalService.updateJournalDay(dayKey, {
        notes: draftNotes[dayKey] ?? ""
      });
      await journalDaysResource.reload();
      notify({
        title: "Journal notes saved",
        description: `Saved notes for ${formatDayLabel(dayKey)}.`,
        tone: "success"
      });
      setEditingNotesByDay((current) => ({
        ...current,
        [dayKey]: false
      }));
    } catch (err) {
      notify({ title: "Could not save day notes", description: err.message, tone: "error" });
    } finally {
      setSavingDayKey("");
    }
  }

  const loading =
    tradesResource.loading ||
    journalDaysResource.loading ||
    tagsResource.loading ||
    strategiesResource.loading;
  const error =
    tradesResource.error || journalDaysResource.error || tagsResource.error || strategiesResource.error;

  if (loading) {
    return <LoadingState label="Loading journal..." panel />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <Card title="TRADING JOURNAL">
        <Filters
          filters={filters}
          onChange={updateFilter}
          onReset={handleResetFilters}
          strategies={strategiesResource.data || []}
          tags={tagsResource.data || []}
          actionContent={
            <button
              type="button"
              onClick={() => updateFilter("hideNoTradeDays", !filters.hideNoTradeDays)}
              className={`ui-button min-h-[46px] px-4 py-3 text-sm ${
                filters.hideNoTradeDays ? "border-white/20 bg-[#1f1f1f] text-white" : "text-white/62"
              }`}
            >
              Hide no-trade days
            </button>
          }
        />
      </Card>

      {pagedDays.length === 0 ? (
        <EmptyState
          title="No journal days match these filters"
          description="Try widening the date range or clearing one of the current filters."
        />
      ) : (
        <>
          <div className="space-y-12">
            {pagedDays.map((day) => (
            <JournalDayCard
              key={day.dayKey}
              day={day}
              noteDraft={draftNotes[day.dayKey] ?? day.note ?? ""}
              onNoteChange={handleNotesChange}
              onSaveNote={handleSaveDay}
              onStartEditingNote={handleStartEditingDay}
              onCancelEditingNote={handleCancelEditingDay}
              isEditingNote={Boolean(editingNotesByDay[day.dayKey])}
              isSaving={savingDayKey === day.dayKey}
              onOpenTrade={(tradeId) => navigate(`/trades/${tradeId}`)}
            />
            ))}
          </div>

          <Card bodyClassName="py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-white/56">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, journalDayKeys.length)} of {journalDayKeys.length} trading day
                {journalDayKeys.length === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage === 1}
                  className="ui-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>
                <div className="ui-chip text-sm">
                  Page {currentPage} / {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={currentPage === totalPages}
                  className="ui-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default JournalPage;
