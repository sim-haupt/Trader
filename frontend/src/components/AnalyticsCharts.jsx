import { useMemo } from "react";
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
const STANDARD_CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 16 };
const VERTICAL_CHART_MARGIN = { top: 8, right: 18, left: 6, bottom: 16 };

export const DEFAULT_DASHBOARD_LAYOUT = [
  { id: "cumulative", span: 2 },
  { id: "performanceSnapshot", span: 2 },
  { id: "drawdown", span: 2 },
  { id: "grossDaily", span: 2 },
  { id: "performanceTimeChart", span: 2 },
  { id: "winPct", span: 2 },
  { id: "dailyVolume", span: 2 },
  { id: "performanceWeekday", span: 1 },
  { id: "performanceHourSummary", span: 1 },
  { id: "performancePrice", span: 2 }
];

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

function metricBorderColor(tone) {
  switch (tone) {
    case "text-mint":
      return "rgba(45, 212, 143, 0.34)";
    case "text-coral":
      return "rgba(255, 107, 107, 0.34)";
    case "text-gold":
      return "rgba(255, 216, 77, 0.34)";
    case "text-mist":
    case "text-phosphor":
      return "rgba(229, 231, 235, 0.18)";
    default:
      return undefined;
  }
}

function MiniMetric({ label, value, tone = "text-white", shadow = false }) {
  return (
    <div
      className="ui-metric-tile h-full"
      style={shadow ? { borderColor: metricBorderColor(tone) } : undefined}
    >
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] ${tone}`}>{value}</p>
    </div>
  );
}

function CircularCompareMetric({
  label,
  centerValue,
  primaryValue,
  secondaryValue,
  primaryDisplay,
  secondaryDisplay,
  primaryLabel,
  secondaryLabel,
  primaryTone = "text-mint",
  secondaryTone = "text-coral",
  shadowTone = "text-mist"
}) {
  const safePrimary = Number(primaryValue || 0);
  const safeSecondary = Number(secondaryValue || 0);
  const total = Math.max(0, safePrimary) + Math.max(0, safeSecondary);
  const primaryPct = total > 0 ? (Math.max(0, safePrimary) / total) * 100 : 0;
  const ringStyle =
    total > 0
      ? {
          background: `conic-gradient(${CHART_GREEN} 0 ${primaryPct}%, ${CHART_RED} ${primaryPct}% 100%)`
        }
      : {
          background: "conic-gradient(rgba(255,255,255,0.16) 0 100%)"
        };

  return (
    <div
      className="ui-metric-tile h-full"
      style={{ borderColor: metricBorderColor(shadowTone) }}
    >
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <div className="group flex h-full flex-col items-center justify-center py-3">
        <div
          className="relative flex h-28 w-28 items-center justify-center rounded-full"
          style={ringStyle}
        >
          <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 w-max -translate-x-1/2 rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-left opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <div className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${primaryTone === "text-mint" ? "bg-mint" : "bg-coral"}`} />
              <span className="text-white/54">{primaryLabel}</span>
              <span className={primaryTone}>{primaryDisplay ?? safePrimary}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${secondaryTone === "text-coral" ? "bg-coral" : "bg-mint"}`} />
              <span className="text-white/54">{secondaryLabel}</span>
              <span className={secondaryTone}>{secondaryDisplay ?? safeSecondary}</span>
            </div>
          </div>
          <div className="flex h-[82px] w-[82px] items-center justify-center rounded-full border border-[var(--line)] bg-black text-center">
            <span className="text-lg font-medium tracking-[-0.04em] text-white">{centerValue}</span>
          </div>
        </div>
      </div>
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

function toneForWinRate(value) {
  if (value === 0) {
    return "text-mist";
  }

  if (value >= 68) {
    return "text-mint";
  }

  if (value < 50) {
    return "text-coral";
  }

  return "text-gold";
}

function toneForRiskReward(value) {
  if (value === 0) {
    return "text-mist";
  }

  if (value < 1) {
    return "text-coral";
  }

  if (value >= 2) {
    return "text-mint";
  }

  return "text-gold";
}

function formatMetricMinutes(value) {
  if (!value) {
    return "0 min";
  }

  if (value < 60) {
    return `${Math.round(value)} min`;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);

  if (!minutes) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function BreakdownRows({ entries, columns = 1 }) {
  const maxMagnitude = Math.max(1, ...entries.map((entry) => Math.abs(entry.pnl || 0)));
  const containerClass = columns === 2 ? "grid gap-4 md:grid-cols-2" : "space-y-4";

  return (
    <div className={containerClass}>
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
  return span === 2 ? "md:col-span-2 lg:col-span-2" : "";
}

function getLastSevenDayTone(day) {
  if (day.trades === 0) {
    return {
      className: "ui-metric-tile rounded-[6px] px-4 py-4",
      valueTone: "text-mist",
      style: undefined
    };
  }

  if (day.pnl >= 0) {
    return {
      className:
        "ui-metric-tile rounded-[6px] bg-[linear-gradient(180deg,rgba(61,255,154,0.16),rgba(61,255,154,0.05))] px-4 py-4",
      valueTone: "text-mint",
      style: {
        borderColor: "rgba(45, 212, 143, 0.34)"
      }
    };
  }

  if (day.pnl < 0) {
    return {
      className:
        "ui-metric-tile rounded-[6px] bg-[linear-gradient(180deg,rgba(255,95,122,0.16),rgba(255,95,122,0.05))] px-4 py-4",
      valueTone: "text-coral",
      style: {
        borderColor: "rgba(255, 107, 107, 0.34)"
      }
    };
  }

  return {
    className: "ui-metric-tile rounded-[6px] bg-white/[0.03] px-4 py-4",
    valueTone: "text-phosphor",
    style: { borderColor: "rgba(229, 231, 235, 0.16)" }
  };
}

function AnalyticsCharts({
  analytics
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

  const widgets = useMemo(
    () => [
      {
        id: "cumulative",
        title: `${pnlLabel} CUMULATIVE P&L`,
        defaultSpan: 2,
        className: "min-h-[620px]",
        body: (
          <>
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <MiniMetric label="TOTAL" value={formatCurrency(summary.totalPnl)} tone={toneForValue(summary.totalPnl)} shadow />
              <MiniMetric label="MONTH" value={formatCurrency(summary.totalMonthPnl)} tone={toneForValue(summary.totalMonthPnl)} shadow />
              <MiniMetric label="WEEK" value={formatCurrency(summary.totalWeekPnl)} tone={toneForValue(summary.totalWeekPnl)} shadow />
              <MiniMetric label="TODAY" value={formatCurrency(summary.totalTodayPnl)} tone={toneForValue(summary.totalTodayPnl)} shadow />
            </div>
            <div className="h-[420px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={STANDARD_CHART_MARGIN}>
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
        id: "performanceSnapshot",
        title: "PERFORMANCE",
        defaultSpan: 2,
        className: "min-h-[620px]",
        body: (
          <div className="flex h-full flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MiniMetric
                label="WIN RATE"
                value={formatPercent(summary.winRate)}
                tone={toneForWinRate(summary.winRate)}
                shadow
              />
              <MiniMetric
                label="R:R"
                value={summary.riskRewardRatio ? `${summary.riskRewardRatio.toFixed(2)} : 1` : "0.00 : 1"}
                tone={toneForRiskReward(summary.riskRewardRatio)}
                shadow
              />
              <MiniMetric
                label="EXPECTANCY"
                value={formatCurrency(summary.expectancyPerTrade)}
                tone={toneForValue(summary.expectancyPerTrade)}
                shadow
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="AVG WIN" value={formatCurrency(summary.averageWin)} tone={toneForValue(summary.averageWin)} shadow />
              <MiniMetric
                label="AVG GAIN / SHARE"
                value={formatCurrency(summary.averageGainPerShare)}
                tone={toneForValue(summary.averageGainPerShare)}
                shadow
              />
              <MiniMetric
                label="AVG LOSS"
                value={formatCurrency(summary.averageLoss)}
                tone={summary.averageLoss === 0 ? "text-mist" : "text-coral"}
                shadow
              />
              <MiniMetric
                label="AVG LOSS / SHARE"
                value={formatCurrency(summary.averageLossPerShare)}
                tone={summary.averageLossPerShare === 0 ? "text-mist" : "text-coral"}
                shadow
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MiniMetric label="WINNING STREAK" value={summary.longestWinStreak} tone="text-mist" shadow />
              <MiniMetric
                label="LOSING STREAK"
                value={summary.longestLossStreak}
                tone="text-mist"
                shadow
              />
              <MiniMetric
                label="PROFIT FACTOR"
                value={summary.profitFactor ? summary.profitFactor.toFixed(2) : "0.00"}
                tone={toneForRiskReward(summary.profitFactor)}
                shadow
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <CircularCompareMetric
                label="TRADE COUNT"
                centerValue={summary.tradeCount.toLocaleString("en-US")}
                primaryValue={summary.wins}
                secondaryValue={summary.losses}
                primaryDisplay={summary.wins.toLocaleString("en-US")}
                secondaryDisplay={summary.losses.toLocaleString("en-US")}
                primaryLabel="WINS"
                secondaryLabel="LOSSES"
                primaryTone="text-mint"
                secondaryTone="text-coral"
                shadowTone="text-mist"
              />
              <CircularCompareMetric
                label="AVG HOLD"
                centerValue={formatMetricMinutes(summary.averageHoldMinutes)}
                primaryValue={Math.round(summary.averageWinningHoldMinutes || 0)}
                secondaryValue={Math.round(summary.averageLosingHoldMinutes || 0)}
                primaryDisplay={formatMetricMinutes(summary.averageWinningHoldMinutes)}
                secondaryDisplay={formatMetricMinutes(summary.averageLosingHoldMinutes)}
                primaryLabel="WIN"
                secondaryLabel="LOSS"
                primaryTone="text-mint"
                secondaryTone="text-coral"
                shadowTone="text-mist"
              />
              <CircularCompareMetric
                label="LARGEST GAIN / LOSS"
                centerValue={formatCurrency(summary.largestWin || summary.largestLoss || 0)}
                primaryValue={Math.abs(summary.largestWin || 0)}
                secondaryValue={Math.abs(summary.largestLoss || 0)}
                primaryDisplay={formatCurrency(summary.largestWin || 0)}
                secondaryDisplay={formatCurrency(summary.largestLoss || 0)}
                primaryLabel="GAIN"
                secondaryLabel="LOSS"
                primaryTone="text-mint"
                secondaryTone="text-coral"
                shadowTone="text-mist"
              />
            </div>
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
              <MiniMetric label="MAX DRAWDOWN" value={formatCurrency(summary.maxDrawdown)} tone={toneForValue(summary.maxDrawdown)} shadow />
              <MiniMetric label="CURRENT DRAWDOWN" value={formatCurrency(summary.currentDrawdown)} tone={toneForValue(summary.currentDrawdown)} shadow />
            </div>
            <div className="h-[220px] pb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drawdownCurve} margin={STANDARD_CHART_MARGIN}>
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
        id: "grossDaily",
        title: `${pnlLabel} DAILY P&L (30 DAYS)`,
        defaultSpan: 2,
        body: (
          <div className="h-[320px] pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grossDailyThirtyDays} margin={STANDARD_CHART_MARGIN}>
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
        id: "performanceTimeChart",
        title: `${pnlLabel} BY TIME OF DAY`,
        defaultSpan: 2,
        body: (
          <div className="h-[320px] pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPerformance} layout="vertical" margin={VERTICAL_CHART_MARGIN}>
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
        id: "winPct",
        title: "WIN %",
        defaultSpan: 2,
        body: (
          <div className="h-[320px] pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={winRateThirtyDays} margin={STANDARD_CHART_MARGIN}>
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
          <div className="h-[320px] pb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyVolumeThirtyDays} margin={STANDARD_CHART_MARGIN}>
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
        id: "performanceWeekday",
        title: `${pnlLabel} BY DAY OF WEEK`,
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByWeekday} />
      },
      {
        id: "performancePrice",
        title: `${pnlLabel} BY PRICE`,
        defaultSpan: 2,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByPrice} columns={2} />
      },
      {
        id: "performanceHourSummary",
        title: `${pnlLabel} BY HOUR OF DAY`,
        defaultSpan: 1,
        className: "min-h-[300px]",
        body: <BreakdownRows entries={performanceByTimeOfDaySummary} />
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

  const orderedWidgets = useMemo(() => {
    const widgetMap = new Map(widgets.map((widget) => [widget.id, widget]));

    return DEFAULT_DASHBOARD_LAYOUT.map((layoutItem) => ({
      ...widgetMap.get(layoutItem.id),
      span: layoutItem.span
    })).filter((widget) => Boolean(widget?.id));
  }, [widgets]);

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

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {orderedWidgets.map((widget) => {
          return (
            <div
              key={widget.id}
              className={widgetSpanClass(widget.span ?? widget.defaultSpan ?? 1)}
            >
              <Card
                title={widget.title}
                className={`h-full ${widget.className || ""}`}
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
