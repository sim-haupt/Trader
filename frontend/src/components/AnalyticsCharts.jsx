import { useMemo, useState } from "react";
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

const CHART_GREEN = "#3dff9a";
const CHART_RED = "#ff5f7a";
const CHART_YELLOW = "#ffd84d";

export const DEFAULT_DASHBOARD_LAYOUT = [
  { id: "cumulative", span: 2 },
  { id: "summaryMetrics", span: 1 },
  { id: "avgStats", span: 1 },
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
  let insertedSummaryMetrics = false;
  let insertedAvgStats = false;

  for (const item of safeLayout) {
    if (!item) {
      continue;
    }

    if (["expectancy", "riskReward"].includes(item.id)) {
      if (!insertedSummaryMetrics) {
        insertedSummaryMetrics = true;
        seen.add("summaryMetrics");
        normalized.push({
          id: "summaryMetrics",
          span: 1
        });
      }
      continue;
    }

    if (item.id === "winStats") {
      if (!insertedAvgStats) {
        insertedAvgStats = true;
        seen.add("avgStats");
        normalized.push({
          id: "avgStats",
          span: 1
        });
      }
      continue;
    }

    if (!WIDGET_IDS.has(item.id) || seen.has(item.id)) {
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
    background: "#050505",
    border: "1px solid rgb(31,31,31)",
    borderRadius: "6px",
    color: "#ededed",
    boxShadow: "none"
  };
}

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  const value = Number(item.value || 0);
  const dataKey = item.dataKey;
  let formattedValue = formatCurrency(value);

  if (dataKey === "winRate") {
    formattedValue = `${value}%`;
  } else if (dataKey === "volume") {
    formattedValue = value.toLocaleString("en-US");
  }

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-[#050505] px-3 py-2">
      <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
        {formattedValue}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = "text-white" }) {
  return (
    <div className="ui-metric-tile h-full">
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
            <div className="h-2 overflow-hidden rounded-[6px] bg-white/10">
              <div
                className={`h-full rounded-[6px] ${tone}`}
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

function getLastSevenDayTone(day) {
  if (day.trades === 0) {
    return {
      className: "ui-metric-tile rounded-[6px] px-4 py-4",
      valueTone: "text-mist",
      style: undefined
    };
  }

  if (day.pnl > 0) {
    return {
      className:
        "ui-metric-tile rounded-[6px] bg-[linear-gradient(180deg,rgba(61,255,154,0.16),rgba(61,255,154,0.05))] px-4 py-4",
      valueTone: "text-mint",
      style: {
        boxShadow: "inset 0 0 0 1px rgba(45, 212, 143, 0.34)"
      }
    };
  }

  if (day.pnl < 0) {
    return {
      className:
        "ui-metric-tile rounded-[6px] bg-[linear-gradient(180deg,rgba(255,95,122,0.16),rgba(255,95,122,0.05))] px-4 py-4",
      valueTone: "text-coral",
      style: {
        boxShadow: "inset 0 0 0 1px rgba(255, 107, 107, 0.34)"
      }
    };
  }

  return {
    className: "ui-metric-tile rounded-[6px] bg-white/[0.03] px-4 py-4",
    valueTone: "text-phosphor",
    style: { boxShadow: "inset 0 0 0 1px rgba(229, 231, 235, 0.16)" }
  };
}

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
    dailyVolumeThirtyDays,
    pnlType
  } = analytics;
  const pnlLabel = pnlType === "GROSS" ? "GROSS" : "NET";

  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const widgets = useMemo(
    () => [
      {
        id: "cumulative",
        title: `${pnlLabel} CUMULATIVE P&L`,
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
                  <Tooltip contentStyle={tooltipStyle()} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                  <Area type="monotone" dataKey="equity" stroke="#18c87a" strokeWidth={3} fill="url(#equityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )
      },
      {
        id: "summaryMetrics",
        title: "WIN RATE / EXPECTANCY / R:R",
        defaultSpan: 1,
        className: "min-h-[205px]",
        body: (
          <div className="grid gap-3">
            <MiniMetric
              label="WIN RATE"
              value={formatPercent(summary.winRate)}
              tone={summary.winRate >= 68 ? "text-mint" : summary.winRate < 50 ? "text-coral" : "text-gold"}
            />
            <MiniMetric
              label="EXPECTANCY"
              value={formatCurrency(summary.expectancyPerTrade)}
              tone={summary.winRate >= 68 ? "text-mint" : summary.winRate < 50 ? "text-coral" : "text-gold"}
            />
            <MiniMetric
              label="R:R"
              value={summary.riskRewardRatio ? `${summary.riskRewardRatio.toFixed(2)} : 1` : "0.00 : 1"}
              tone={
                summary.riskRewardRatio < 1
                  ? "text-coral"
                  : summary.riskRewardRatio >= 2
                    ? "text-mint"
                    : "text-gold"
              }
            />
          </div>
        )
      },
      {
        id: "avgStats",
        title: "AVG WIN / AVG LOSS / SHARE",
        defaultSpan: 1,
        className: "min-h-[205px]",
        body: (
          <div className="grid gap-3 md:grid-cols-2">
            <MiniMetric label="AVG WIN" value={formatCurrency(summary.averageWin)} tone="text-mint" />
            <MiniMetric label="AVG LOSS" value={formatCurrency(summary.averageLoss)} tone="text-coral" />
            <MiniMetric label="AVG GAIN / SHARE" value={formatCurrency(summary.averageGainPerShare)} tone="text-mint" />
            <MiniMetric label="AVG LOSS / SHARE" value={formatCurrency(summary.averageLossPerShare)} tone="text-coral" />
          </div>
        )
      },
      {
        id: "drawdown",
        title: `${pnlLabel} DRAWDOWN TRACKER`,
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
        title: `${pnlLabel} BY DAY OF WEEK`,
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByWeekday} />
      },
      {
        id: "performancePrice",
        title: `${pnlLabel} BY PRICE`,
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByPrice} />
      },
      {
        id: "performanceHourSummary",
        title: `${pnlLabel} BY HOUR OF DAY`,
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByTimeOfDaySummary} />
      },
      {
        id: "performanceTimeChart",
        title: `${pnlLabel} BY TIME OF DAY`,
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPerformance} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <YAxis type="category" dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} width={48} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                <Bar dataKey="pnl" barSize={18}>
                  {hourlyPerformance.map((entry) => (
                    <Cell key={entry.label} fill={entry.pnl >= 0 ? CHART_GREEN : CHART_RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      },
      {
        id: "grossDaily",
        title: `${pnlLabel} DAILY P&L (30 DAYS)`,
        defaultSpan: 2,
        body: (
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grossDailyThirtyDays}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} minTickGap={18} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                <Bar dataKey="grossPnl" barSize={20}>
                  {grossDailyThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill={entry.grossPnl >= 0 ? CHART_GREEN : CHART_RED} />
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
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                <Bar dataKey="winRate" barSize={20}>
                  {winRateThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill={CHART_GREEN} />
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
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltipContent />} offset={14} allowEscapeViewBox={{ x: true, y: true }} />
                <Bar dataKey="volume" barSize={20}>
                  {dailyVolumeThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill={CHART_GREEN} />
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
    [
      summary,
      equityCurve,
      drawdownCurve,
      performanceByWeekday,
      performanceByPrice,
      performanceByTimeOfDaySummary,
      hourlyPerformance,
      grossDailyThirtyDays,
      winRateThirtyDays,
      dailyVolumeThirtyDays,
      pnlLabel
    ]
  );

  const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));
  const orderedWidgets = normalizeDashboardLayout(layout)
    .map((item) => ({ ...item, widget: widgetMap.get(item.id) }))
    .filter((item) => item.widget);

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
      <div className="ui-panel p-5">
        <div className="grid gap-3 md:grid-cols-7">
          {lastSevenDays.map((day) => {
            const tone = getLastSevenDayTone(day);

            return (
            <div
              key={day.date}
              className={tone.className}
              style={tone.style}
            >
              <p className="ui-title text-[10px] uppercase text-white/45">{day.weekday}</p>
              <p className="mt-2 text-sm text-white/62">{day.label}</p>
              <p className={`mt-4 text-2xl font-bold tracking-[-0.04em] ${tone.valueTone}`}>
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-xs text-white/56">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          )})}
        </div>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
        {orderedWidgets.map(({ id, span, widget }) => {
          const cardAction = editing ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleSpan?.(id)}
                className="ui-button px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/76 hover:text-white"
              >
                {span === 2 ? "Normal" : "Wide"}
              </button>
              <span className="ui-button cursor-grab select-none px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/56">
                Drag
              </span>
            </div>
          ) : null;

          return (
            <div
              key={id}
              draggable={editing}
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
                  ? "rounded-[6px] bg-mint/8 p-[3px] ring-2 ring-mint/90 shadow-[0_0_0_1px_rgba(86,240,169,0.35)]"
                  : ""
              }`}
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
