import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "./ui/Card";
import { formatCurrency, formatPercent } from "../utils/formatters";

export const DEFAULT_DASHBOARD_LAYOUT = [
  { id: "cumulative", span: 2 },
  { id: "expectancy", span: 1 },
  { id: "riskReward", span: 1 },
  { id: "winStats", span: 2 },
  { id: "drawdown", span: 2 },
  { id: "performanceWeekday", span: 1 },
  { id: "performancePrice", span: 1 },
  { id: "performanceHourSummary", span: 1 },
  { id: "performanceTimeChart", span: 2 },
  { id: "grossDaily", span: 2 },
  { id: "winPct", span: 2 },
  { id: "dailyVolume", span: 2 },
  { id: "streaks", span: 1 }
];

const WIDGET_IDS = new Set(DEFAULT_DASHBOARD_LAYOUT.map((item) => item.id));

export function normalizeDashboardLayout(layout) {
  const safeLayout = Array.isArray(layout) ? layout : [];
  const seen = new Set();
  const normalized = [];

  for (const item of safeLayout) {
    if (!item || !WIDGET_IDS.has(item.id) || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    normalized.push({
      id: item.id,
      span: item.span === 2 ? 2 : 1
    });
  }

  for (const fallback of DEFAULT_DASHBOARD_LAYOUT) {
    if (!seen.has(fallback.id)) {
      normalized.push(fallback);
    }
  }

  return normalized;
}

function tooltipStyle() {
  return {
    background: "rgba(25,30,43,0.96)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    color: "#f5f7fb",
    boxShadow: "0 18px 40px rgba(0,0,0,0.28)"
  };
}

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const value = Number(payload[0].value || 0);

  return (
    <div className="rounded-[12px] border border-white/10 bg-[#171d29]/95 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur">
      <div className="text-xs font-medium text-white/72">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
        {typeof value === "number" && label?.includes("%") ? `${value}%` : formatCurrency(value)}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = "text-white" }) {
  return (
    <div className="h-full rounded-[12px] border border-[#e5e7eb42] bg-white/[0.025] px-4 py-4">
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] ${tone}`}>{value}</p>
    </div>
  );
}

function toneForValue(value) {
  if (value > 0) {
    return "text-mint";
  }

  if (value < 0) {
    return "text-coral";
  }

  return "text-mist";
}

function BreakdownRows({ entries }) {
  const maxMagnitude = Math.max(1, ...entries.map((entry) => Math.abs(entry.pnl || 0)));

  return (
    <div className="space-y-4">
      {entries.map((entry) => {
        const pct = entry.percentage ?? 0;
        const width = entry.pnl === 0 ? 0 : Math.max(4, (Math.abs(entry.pnl) / maxMagnitude) * 100);
        const tone = entry.pnl >= 0 ? "bg-mint" : "bg-coral";
        const label = entry.label ?? entry.day;

        return (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-white/88">{label}</span>
              <div className="flex items-center gap-2 text-right">
                <span className={`text-sm font-semibold ${entry.pnl >= 0 ? "text-mint" : "text-coral"}`}>
                  {formatCurrency(entry.pnl)}
                </span>
                <span className="text-xs text-white/46">{pct.toFixed(2)}%</span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${tone}`}
                style={{ width: `${width}%`, opacity: entry.pnl === 0 ? 0.22 : 0.9 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function widgetSpanClass(span) {
  return span === 2 ? "md:col-span-2 xl:col-span-2" : "";
}

const MASONRY_ROW_HEIGHT = 8;
const MASONRY_GAP = 20;

function AnalyticsCharts({
  analytics,
  layout = DEFAULT_DASHBOARD_LAYOUT,
  editing = false,
  onReorder,
  onToggleSpan
}) {
  const {
    summary,
    equityCurve,
    drawdownCurve,
    lastSevenDays,
    performanceByWeekday,
    performanceByTimeOfDaySummary,
    performanceByPrice,
    hourlyPerformance,
    grossDailyThirtyDays,
    winRateThirtyDays,
    dailyVolumeThirtyDays
  } = analytics;

  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const itemRefs = useRef({});
  const [rowSpans, setRowSpans] = useState({});

  const widgets = useMemo(
    () => [
      {
        id: "cumulative",
        title: "CUMULATIVE P&L",
        defaultSpan: 2,
        body: (
          <>
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <MiniMetric label="TOTAL" value={formatCurrency(summary.totalPnl)} tone={toneForValue(summary.totalPnl)} />
              <MiniMetric label="MONTH" value={formatCurrency(summary.totalMonthPnl)} tone={toneForValue(summary.totalMonthPnl)} />
              <MiniMetric label="WEEK" value={formatCurrency(summary.totalWeekPnl)} tone={toneForValue(summary.totalWeekPnl)} />
              <MiniMetric label="TODAY" value={formatCurrency(summary.totalTodayPnl)} tone={toneForValue(summary.totalTodayPnl)} />
            </div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve}>
                  <defs>
                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2be28c" stopOpacity={0.22} />
                      <stop offset="55%" stopColor="#2be28c" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#2be28c" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Area type="monotone" dataKey="equity" stroke="#18c87a" strokeWidth={3} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      },
      {
        id: "expectancy",
        title: "EXPECTANCY",
        defaultSpan: 1,
        className: "min-h-[205px]",
        body: (
          <div className="grid h-full">
            <MiniMetric
              label="EXPECTANCY PER TRADE"
              value={formatCurrency(summary.expectancyPerTrade)}
              tone={toneForValue(summary.expectancyPerTrade)}
            />
          </div>
        )
      },
      {
        id: "riskReward",
        title: "RISK REWARD RATIO",
        defaultSpan: 1,
        className: "min-h-[205px]",
        body: (
          <div className="grid h-full">
            <MiniMetric
              label="R:R"
              value={summary.riskRewardRatio ? `${summary.riskRewardRatio.toFixed(2)} : 1` : "0.00 : 1"}
              tone={summary.riskRewardRatio >= 1 ? "text-mint" : "text-coral"}
            />
          </div>
        )
      },
      {
        id: "winStats",
        title: "WIN RATE / AVG WIN / AVG LOSS",
        defaultSpan: 2,
        body: (
          <div className="grid gap-3">
            <MiniMetric
              label="WIN RATE"
              value={formatPercent(summary.winRate)}
              tone={summary.winRate >= 68 ? "text-mint" : summary.winRate < 50 ? "text-coral" : "text-[#ffc14d]"}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <MiniMetric label="AVG WIN" value={formatCurrency(summary.averageWin)} tone="text-mint" />
              <MiniMetric label="AVG LOSS" value={formatCurrency(summary.averageLoss)} tone="text-coral" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MiniMetric label="AVG GAIN / SHARE" value={formatCurrency(summary.averageGainPerShare)} tone="text-mint" />
              <MiniMetric label="AVG LOSS / SHARE" value={formatCurrency(summary.averageLossPerShare)} tone="text-coral" />
            </div>
          </div>
        )
      },
      {
        id: "drawdown",
        title: "DRAWDOWN TRACKER",
        defaultSpan: 2,
        body: (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <MiniMetric label="MAX DRAWDOWN" value={formatCurrency(summary.maxDrawdown)} tone="text-coral" />
              <MiniMetric label="CURRENT DRAWDOWN" value={formatCurrency(summary.currentDrawdown)} tone="text-coral" />
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownCurve}>
                  <defs>
                    <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff6b6b" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#ff6b6b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle()} />
                  <Area type="monotone" dataKey="drawdown" stroke="#ff6b6b" strokeWidth={2.5} fill="url(#drawdownGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      },
      {
        id: "performanceWeekday",
        title: "PERFORMANCE BY DAY OF WEEK",
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByWeekday} />
      },
      {
        id: "performancePrice",
        title: "PERFORMANCE BY PRICE",
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByPrice} />
      },
      {
        id: "performanceHourSummary",
        title: "PERFORMANCE BY HOUR OF DAY",
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByTimeOfDaySummary} />
      },
      {
        id: "performanceTimeChart",
        title: "PERFORMANCE BY TIME OF DAY",
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPerformance} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} width={48} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} />
                <Bar dataKey="pnl" barSize={18}>
                  {hourlyPerformance.map((entry) => (
                    <Cell key={entry.label} fill={entry.pnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      },
      {
        id: "grossDaily",
        title: "GROSS DAILY P&L (30 DAYS)",
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grossDailyThirtyDays}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} />
                <Bar dataKey="grossPnl" barSize={20}>
                  {grossDailyThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill={entry.grossPnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      },
      {
        id: "winPct",
        title: "WIN %",
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={winRateThirtyDays}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} />
                <Bar dataKey="winRate" barSize={20}>
                  {winRateThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill="#56f0a9" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      },
      {
        id: "dailyVolume",
        title: "DAILY VOLUME",
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyVolumeThirtyDays}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} />
                <Bar dataKey="volume" barSize={20}>
                  {dailyVolumeThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill="#56f0a9" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      },
      {
        id: "streaks",
        title: "STREAKS",
        defaultSpan: 1,
        className: "min-h-[205px]",
        body: (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <MiniMetric label="WINNING STREAK" value={summary.longestWinStreak} tone="text-mint" />
            <MiniMetric label="LOSING STREAK" value={summary.longestLossStreak} tone="text-coral" />
          </div>
        )
      }
    ],
    [summary, equityCurve, drawdownCurve, performanceByWeekday, performanceByPrice, performanceByTimeOfDaySummary, hourlyPerformance, grossDailyThirtyDays, winRateThirtyDays, dailyVolumeThirtyDays]
  );

  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  const orderedWidgets = normalizeDashboardLayout(layout)
    .map((item) => ({ ...item, widget: widgetMap.get(item.id) }))
    .filter((item) => item.widget);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setRowSpans((current) => {
        const next = { ...current };
        let changed = false;

        for (const entry of entries) {
          const id = entry.target.dataset.widgetId;
          if (!id) {
            continue;
          }

          const height = entry.contentRect.height;
          const span = Math.max(1, Math.ceil((height + MASONRY_GAP) / (MASONRY_ROW_HEIGHT + MASONRY_GAP)));

          if (next[id] !== span) {
            next[id] = span;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    });

    Object.values(itemRefs.current).forEach((node) => {
      if (node) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [orderedWidgets]);

  function handleDrop(targetId) {
    if (!draggedId || draggedId === targetId) {
      setDropTargetId(null);
      return;
    }

    onReorder?.(draggedId, targetId);
    setDraggedId(null);
    setDropTargetId(null);
  }

  return (
    <div className="space-y-6">
      <div className="ui-panel border-[#e5e7eb42] p-5">
        <div className="grid gap-3 md:grid-cols-7">
          {lastSevenDays.map((day) => (
            <div
              key={day.date}
              className="rounded-[10px] border border-[#e5e7eb42] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))] px-4 py-4"
            >
              <p className="ui-title text-[10px] uppercase text-white/45">{day.weekday}</p>
              <p className="mt-2 text-sm text-white/62">{day.label}</p>
              <p className={`mt-4 text-2xl font-bold tracking-[-0.04em] ${day.trades === 0 ? "text-mist" : day.pnl >= 0 ? "text-mint" : "text-coral"}`}>
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-xs text-white/56">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        className="grid grid-flow-row-dense items-start gap-5 md:grid-cols-2 xl:grid-cols-4"
        style={{ gridAutoRows: `${MASONRY_ROW_HEIGHT}px` }}
      >
        {orderedWidgets.map(({ id, span, widget }) => {
          const cardAction = editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleSpan?.(id)}
                className="rounded-[10px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/76 hover:bg-white/[0.08]"
              >
                {span === 2 ? "Normal" : "Wide"}
              </button>
              <span className="cursor-grab select-none rounded-[10px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/48">
                Drag
              </span>
            </div>
          ) : null;

          return (
            <div
              key={id}
              draggable={editing}
              ref={(node) => {
                if (node) {
                  itemRefs.current[id] = node;
                } else {
                  delete itemRefs.current[id];
                }
              }}
              data-widget-id={id}
              onDragStart={() => {
                setDraggedId(id);
                setDropTargetId(id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDropTargetId(null);
              }}
              onDragEnter={() => {
                if (editing && draggedId && draggedId !== id) {
                  setDropTargetId(id);
                }
              }}
              onDragOver={(event) => {
                if (editing) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (draggedId && draggedId !== id && dropTargetId !== id) {
                    setDropTargetId(id);
                  }
                }
              }}
              onDrop={() => handleDrop(id)}
              className={`${widgetSpanClass(span)} ${editing && draggedId === id ? "opacity-60" : ""} ${
                editing && dropTargetId === id && draggedId !== id
                  ? "rounded-[16px] bg-mint/8 p-[3px] ring-2 ring-mint/90 shadow-[0_0_0_1px_rgba(86,240,169,0.35)]"
                  : ""
              }`}
              style={{ gridRowEnd: `span ${rowSpans[id] || 1}` }}
            >
              <Card
                title={widget.title}
                action={cardAction}
                className={`h-full transition ${widget.className || ""} ${editing ? "ring-1 ring-white/10" : ""}`}
              >
                {widget.body}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default AnalyticsCharts;
