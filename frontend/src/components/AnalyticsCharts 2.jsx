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
    <div
      className="rounded-[12px] border border-white/10 bg-[#171d29]/95 px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.32)] backdrop-blur"
    >
      <div className="text-xs font-medium text-white/72">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${value >= 0 ? "text-mint" : "text-coral"}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, tone = "text-white" }) {
  return (
    <div className="rounded-[12px] border border-[#e5e7eb42] bg-white/[0.025] px-4 py-4">
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

function AnalyticsCharts({ analytics }) {
  const {
    summary,
    equityCurve,
    drawdownCurve,
    lastSevenDays,
    performanceByWeekday,
    performanceByTimeOfDay,
    hourlyPerformance,
    grossDailyThirtyDays
  } = analytics;

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
              <p
                className={`mt-4 text-2xl font-bold tracking-[-0.04em] ${
                  day.trades === 0 ? "text-mist" : day.pnl >= 0 ? "text-mint" : "text-coral"
                }`}
              >
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-xs text-white/56">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr_0.75fr]">
        <Card title="CUMULATIVE P&L" className="xl:row-span-2">
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
        </Card>

        <Card title="EXPECTANCY">
          <MiniMetric
            label="EXPECTANCY PER TRADE"
            value={formatCurrency(summary.expectancyPerTrade)}
            tone={toneForValue(summary.expectancyPerTrade)}
          />
        </Card>

        <Card title="RISK REWARD RATIO">
          <MiniMetric
            label="R:R"
            value={summary.riskRewardRatio ? `${summary.riskRewardRatio.toFixed(2)} : 1` : "0.00 : 1"}
            tone={summary.riskRewardRatio >= 1 ? "text-mint" : "text-coral"}
          />
        </Card>

        <Card title="WIN RATE / AVG WIN / AVG LOSS">
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
        </Card>

        <Card title="DRAWDOWN TRACKER">
          <div className="mb-4">
            <MiniMetric label="MAX DRAWDOWN" value={formatCurrency(summary.maxDrawdown)} tone="text-coral" />
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
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr_0.9fr_0.8fr]">
        <Card title="PERFORMANCE BY DAY OF WEEK">
          <div className="space-y-3">
            {performanceByWeekday.map((entry) => (
              <div key={entry.day} className="rounded-[12px] border border-[#e5e7eb42] bg-white/[0.02] px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-sm text-white/72">
                  <span>{entry.day}</span>
                  <span className={entry.pnl >= 0 ? "text-mint" : "text-coral"}>{formatCurrency(entry.pnl)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${entry.pnl >= 0 ? "bg-mint" : "bg-coral"}`}
                    style={{ width: `${Math.min(100, Math.max(8, Math.abs(entry.pnl) / Math.max(1, Math.max(...performanceByWeekday.map((item) => Math.abs(item.pnl)))) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="PERFORMANCE BY TIME OF DAY">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyPerformance} layout="vertical" margin={{ top: 4, right: 18, left: 6, bottom: 4 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="pnl" barSize={18}>
                  {hourlyPerformance.map((entry) => (
                    <Cell key={entry.label} fill={entry.pnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="GROSS DAILY P&L (30 DAYS)">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grossDailyThirtyDays}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                  minTickGap={18}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value}`}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="grossPnl" barSize={20}>
                  {grossDailyThirtyDays.map((entry) => (
                    <Cell key={entry.date} fill={entry.grossPnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="STREAKS">
          <div className="grid gap-3">
            <MiniMetric label="WINNING STREAK" value={summary.longestWinStreak} tone="text-mint" />
            <MiniMetric label="LOSING STREAK" value={summary.longestLossStreak} tone="text-coral" />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
