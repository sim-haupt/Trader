import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "./ui/Card";
import StatCard from "./ui/StatCard";
import { formatCurrency, formatPercent } from "../utils/formatters";

function tooltipStyle() {
  return {
    background: "rgba(17,17,22,0.98)",
    border: "2px solid rgba(255,255,255,0.1)",
    borderRadius: "0px",
    color: "#f5f7fb",
    boxShadow: "0 18px 40px rgba(0,0,0,0.32)"
  };
}

function MiniMetric({ label, value, tone = "text-white", note }) {
  return (
    <div className="ui-panel px-4 py-4">
      <p className="ui-title text-xs text-white">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
      {note ? <p className="mt-2 text-sm text-white/70">{note}</p> : null}
    </div>
  );
}

function AnalyticsCharts({ analytics }) {
  const { summary, equityCurve, lastFiveDays, latestDateLabel } = analytics;
  const winRateAccent =
    summary.winRate >= 68 ? "mint" : summary.winRate < 50 ? "coral" : "warning";

  const winLossData = [
    { name: "Wins", value: summary.wins, color: "#56f0a9" },
    { name: "Losses", value: summary.losses, color: "#ff6b6b" }
  ];

  return (
    <div className="space-y-6">
      <Card
        title="Last Five Days"
        subtitle={`Daily snapshots ending ${latestDateLabel}. Days with no trades still appear.`}
      >
        <div className="grid gap-3 md:grid-cols-5">
          {lastFiveDays.map((day) => (
            <div key={day.date} className="ui-panel px-4 py-4">
              <p className="ui-title text-xs text-white">{day.weekday}</p>
              <p className="mt-2 text-sm text-white/70">{day.label}</p>
              <p className={`mt-4 text-2xl font-semibold ${day.pnl >= 0 ? "text-mint" : "text-coral"}`}>
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-xs text-white/70">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Net P&L Total"
          value={formatCurrency(summary.totalPnl)}
          accent={summary.totalPnl >= 0 ? "mint" : "coral"}
        />
        <StatCard
          label="Net P&L Month"
          value={formatCurrency(summary.totalMonthPnl)}
          accent={summary.totalMonthPnl >= 0 ? "mint" : "coral"}
        />
        <StatCard
          label="Net P&L Week"
          value={formatCurrency(summary.totalWeekPnl)}
          accent={summary.totalWeekPnl >= 0 ? "mint" : "coral"}
        />
        <StatCard
          label="Net P&L Today"
          value={formatCurrency(summary.totalTodayPnl)}
          accent={summary.totalTodayPnl >= 0 ? "mint" : "coral"}
        />
        <StatCard label="Win Rate" value={formatPercent(summary.winRate)} accent={winRateAccent} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.28fr_0.64fr_0.64fr]">
        <Card
          title="Cumulative P&L"
          subtitle="A running snapshot of how your P&L evolves across the full trade history."
          className="xl:row-span-2"
        >
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <MiniMetric
              label="Average Trade P&L"
              value={formatCurrency(summary.averageTradePnl)}
              tone={summary.averageTradePnl >= 0 ? "text-mint" : "text-coral"}
              note={`${summary.tradeCount} trade${summary.tradeCount === 1 ? "" : "s"}`}
            />
            <MiniMetric
              label="Largest Gain"
              value={formatCurrency(summary.largestWin)}
              tone="text-mint"
              note="Best single trade"
            />
            <MiniMetric
              label="Largest Loss"
              value={formatCurrency(summary.largestLoss)}
              tone="text-coral"
              note="Worst single trade"
            />
          </div>

          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d9dde6" stopOpacity={0.18} />
                    <stop offset="45%" stopColor="#18a36b" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#18a36b" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#6e7585" tickLine={false} axisLine={false} />
                <YAxis stroke="#6e7585" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#18a36b"
                  strokeWidth={3}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Winning vs Losing Trades" subtitle="Fast pulse on trade balance.">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={winLossData} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">
                  {winLossData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Wins" value={summary.wins} tone="text-mint" />
            <MiniMetric label="Losses" value={summary.losses} tone="text-coral" />
          </div>
        </Card>

        <Card title="Hold Time Winning Trades vs Losing Trades" subtitle="Average hold time split by result.">
          <div className="space-y-6 pt-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-phosphor">Winning Hold</span>
                <span className="text-mint">
                  {Number(summary.averageWinningHoldMinutes.toFixed(1))} min
                </span>
              </div>
              <div className="h-3 bg-white/10">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#d9dde6,#18a36b)]"
                  style={{ width: `${Math.min(100, summary.averageWinningHoldMinutes * 6)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-phosphor">Losing Hold</span>
                <span className="text-coral">
                  {Number(summary.averageLosingHoldMinutes.toFixed(1))} min
                </span>
              </div>
              <div className="h-3 bg-white/10">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#ff6b6b,#ff8a76)]"
                  style={{ width: `${Math.min(100, summary.averageLosingHoldMinutes * 6)}%` }}
                />
              </div>
            </div>
            <MiniMetric
              label="Average Trade P&L"
              value={formatCurrency(summary.averageTradePnl)}
              tone={summary.averageTradePnl >= 0 ? "text-mint" : "text-coral"}
              note="Across all closed trades"
            />
          </div>
        </Card>

        <Card title="Largest Gain vs Largest Loss" subtitle="Best and worst trade results side by side.">
          <div className="space-y-5 pt-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-white">Largest Gain</span>
                <span className="text-mint">{formatCurrency(summary.largestWin)}</span>
              </div>
              <div className="h-3 bg-white/10">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#d9dde6,#18a36b)]"
                  style={{ width: `${Math.min(100, Math.abs(summary.largestWin) * 2)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-white">Largest Loss</span>
                <span className="text-coral">{formatCurrency(summary.largestLoss)}</span>
              </div>
              <div className="h-3 bg-white/10">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#ff6174,#ff8b98)]"
                  style={{ width: `${Math.min(100, Math.abs(summary.largestLoss) * 2)}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
