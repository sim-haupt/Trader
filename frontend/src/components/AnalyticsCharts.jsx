import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

function AnalyticsCharts({ analytics }) {
  const { summary, equityCurve, recentDays, performanceByWeekday } = analytics;
  const winLossData = [
    { name: "Wins", value: summary.wins, color: "#27c97b" },
    { name: "Losses", value: summary.losses, color: "#ff5b49" }
  ];
  const holdTimeData = [
    {
      label: "Winning Trades",
      value: Number(summary.averageWinningHoldMinutes.toFixed(1)),
      color: "#27c97b"
    },
    {
      label: "Losing Trades",
      value: Number(summary.averageLosingHoldMinutes.toFixed(1)),
      color: "#ff5b49"
    }
  ];
  const averageTradeData = [
    { label: "Avg Win", value: Number(summary.averageWin.toFixed(2)), color: "#27c97b" },
    { label: "Avg Loss", value: Number((-summary.averageLoss).toFixed(2)), color: "#ff5b49" }
  ];

  return (
    <div className="space-y-6">
      <Card title="Apr 2026" subtitle="Recent trading days at a glance.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {recentDays.map((day) => (
            <div
              key={day.date}
              className="rounded-2xl border border-white/10 bg-slate-950/25 px-4 py-5"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-white">
                  {Number(day.date.slice(-2))}
                </span>
                <span className="text-sm font-medium text-mist">{day.weekday}</span>
              </div>
              <p
                className={`mt-10 text-3xl font-semibold ${
                  day.pnl >= 0 ? "text-mint" : "text-coral"
                }`}
              >
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-sm text-mist">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net P&L" value={formatCurrency(summary.totalPnl)} accent="mint" />
        <StatCard label="Win Rate" value={formatPercent(summary.winRate)} accent="gold" />
        <StatCard label="Expectancy" value={formatCurrency(summary.expectancy)} accent="mint" />
        <StatCard label="Trades" value={summary.tradeCount} accent="coral" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.62fr_0.62fr]">
        <Card
          title="Cumulative P&L"
          subtitle="A running snapshot of how your equity evolves across your trade history."
          className="xl:row-span-2"
        >
          <div className="h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#27c97b" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#27c97b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(141, 160, 196, 0.12)" vertical={false} />
                <XAxis dataKey="date" stroke="#8da0c4" tickLine={false} axisLine={false} />
                <YAxis stroke="#8da0c4" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#111b2d",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px"
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#27c97b"
                  strokeWidth={3}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Winning vs Losing Trades">
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLossData}
                  dataKey="value"
                  innerRadius={70}
                  outerRadius={94}
                  paddingAngle={2}
                  stroke="none"
                >
                  {winLossData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#111b2d",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px"
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.25em] text-mist">Wins</p>
              <p className="mt-2 text-2xl font-semibold text-mint">{summary.wins}</p>
            </div>
            <div className="rounded-2xl bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.25em] text-mist">Losses</p>
              <p className="mt-2 text-2xl font-semibold text-coral">{summary.losses}</p>
            </div>
          </div>
        </Card>

        <Card title="Hold Time Winning Trades vs Losing Trades">
          <div className="space-y-6 pt-8">
            {holdTimeData.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-white">{item.label}</span>
                  <span className="text-mist">{item.value} minutes</span>
                </div>
                <div className="h-3 rounded-full bg-white/5">
                  <div
                    className="h-3 rounded-full"
                    style={{
                      width: `${Math.min(100, item.value * 6)}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Average Winning Trade vs Losing Trade">
          <div className="space-y-6 pt-8">
            {averageTradeData.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-white">{item.label}</span>
                  <span className={item.value >= 0 ? "text-mint" : "text-coral"}>
                    {formatCurrency(item.value)}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-white/5">
                  <div
                    className="h-3 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.abs(item.value) * 2.2)}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Largest Gain vs Largest Loss">
          <div className="grid h-[250px] place-items-center">
            <div className="relative h-44 w-44 overflow-hidden rounded-t-full border-[14px] border-b-0 border-mint/90 border-r-coral/95 border-t-mint/90 border-l-mint/90">
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-2 pb-3 text-xs text-mist">
                <span>{formatCurrency(summary.largestLoss)}</span>
                <span>{formatCurrency(summary.largestWin)}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Performance By Day Of Week" className="xl:col-span-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceByWeekday}>
                <CartesianGrid stroke="rgba(141, 160, 196, 0.1)" vertical={false} />
                <XAxis dataKey="day" stroke="#8da0c4" tickLine={false} axisLine={false} />
                <YAxis stroke="#8da0c4" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#111b2d",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px"
                  }}
                />
                <Bar dataKey="pnl" radius={[8, 8, 0, 0]}>
                  {performanceByWeekday.map((entry) => (
                    <Cell
                      key={entry.day}
                      fill={entry.pnl >= 0 ? "#27c97b" : "#ff5b49"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
