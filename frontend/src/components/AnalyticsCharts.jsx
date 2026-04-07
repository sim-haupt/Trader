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

function tooltipStyle() {
  return {
    background: "#050907",
    border: "2px solid rgba(114,243,198,0.3)",
    borderRadius: "0px",
    color: "#effff6"
  };
}

function AnalyticsCharts({ analytics }) {
  const { summary, equityCurve, recentDays, performanceByWeekday } = analytics;
  const headerDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date());
  const headerTime = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());

  const winLossData = [
    { name: "Wins", value: summary.wins, color: "#72f3c6" },
    { name: "Losses", value: summary.losses, color: "#a5f5d8" }
  ];
  const holdTimeData = [
    { label: "Winning Trades", value: Number(summary.averageWinningHoldMinutes.toFixed(1)), color: "#72f3c6" },
    { label: "Losing Trades", value: Number(summary.averageLosingHoldMinutes.toFixed(1)), color: "#9cebcf" }
  ];
  const averageTradeData = [
    { label: "Avg Win", value: Number(summary.averageWin.toFixed(2)), color: "#72f3c6" },
    { label: "Avg Loss", value: Number((-summary.averageLoss).toFixed(2)), color: "#9cebcf" }
  ];

  return (
    <div className="space-y-6">
      <section className="ui-panel p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="ui-title text-3xl text-[#effff6]">{headerDate}</p>
            <div className="mt-6 h-[2px] w-full max-w-[420px] bg-mint/60" />
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <span className="ui-title text-5xl text-[#effff6]">{headerTime}</span>
              <span className="ui-chip">CET</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[520px] xl:grid-cols-3">
            <div className="ui-panel p-4">
              <p className="ui-title text-xs text-mist">Session</p>
              <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.12em] text-mint">Active</p>
            </div>
            <div className="ui-panel p-4">
              <p className="ui-title text-xs text-mist">Trend State</p>
              <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.12em] text-mint">
                {summary.totalPnl >= 0 ? "Bull Bias" : "Risk Off"}
              </p>
            </div>
            <div className="ui-panel p-4">
              <p className="ui-title text-xs text-mist">Health</p>
              <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.12em] text-[#effff6]">
                {Math.max(0, Math.round(summary.winRate))}
              </p>
            </div>
          </div>
        </div>
      </section>

      <Card title="Recent Sessions" subtitle="Recent trading days at a glance.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {recentDays.map((day) => (
            <div key={day.date} className="ui-panel px-4 py-5">
              <div className="flex items-baseline gap-2">
                <span className="ui-title text-3xl text-[#effff6]">{Number(day.date.slice(-2))}</span>
                <span className="ui-title text-sm text-mist">{day.weekday}</span>
              </div>
              <p className={`mt-10 text-3xl font-semibold ${day.pnl >= 0 ? "text-mint" : "text-[#9cebcf]"}`}>
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-sm uppercase tracking-[0.08em] text-mist">
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
                    <stop offset="5%" stopColor="#72f3c6" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#72f3c6" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(114,243,198,0.12)" vertical={false} />
                <XAxis dataKey="date" stroke="#72f3c6" tickLine={false} axisLine={false} />
                <YAxis stroke="#72f3c6" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#72f3c6"
                  strokeWidth={3}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Winning vs Losing">
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={winLossData} dataKey="value" innerRadius={70} outerRadius={94} paddingAngle={2} stroke="none">
                  {winLossData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle()} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="ui-panel px-4 py-3">
              <p className="ui-title text-xs text-mist">Wins</p>
              <p className="mt-2 text-2xl font-semibold text-mint">{summary.wins}</p>
            </div>
            <div className="ui-panel px-4 py-3">
              <p className="ui-title text-xs text-mist">Losses</p>
              <p className="mt-2 text-2xl font-semibold text-[#9cebcf]">{summary.losses}</p>
            </div>
          </div>
        </Card>

        <Card title="Hold Time">
          <div className="space-y-6 pt-8">
            {holdTimeData.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[#effff6]">{item.label}</span>
                  <span className="text-mint">{item.value} minutes</span>
                </div>
                <div className="h-3 bg-black/35">
                  <div className="h-3" style={{ width: `${Math.min(100, item.value * 6)}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Average Trade">
          <div className="space-y-6 pt-8">
            {averageTradeData.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-[#effff6]">{item.label}</span>
                  <span className={item.value >= 0 ? "text-mint" : "text-[#9cebcf]"}>{formatCurrency(item.value)}</span>
                </div>
                <div className="h-3 bg-black/35">
                  <div className="h-3" style={{ width: `${Math.min(100, Math.abs(item.value) * 2.2)}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Largest Gain vs Loss">
          <div className="grid h-[250px] place-items-center">
            <div className="relative h-44 w-44 overflow-hidden border-[14px] border-b-0 border-mint/90">
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-2 pb-3 text-xs text-mint">
                <span>{formatCurrency(summary.largestLoss)}</span>
                <span>{formatCurrency(summary.largestWin)}</span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Performance By Weekday" className="xl:col-span-2">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceByWeekday}>
                <CartesianGrid stroke="rgba(114,243,198,0.12)" vertical={false} />
                <XAxis dataKey="day" stroke="#72f3c6" tickLine={false} axisLine={false} />
                <YAxis stroke="#72f3c6" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Bar dataKey="pnl" radius={[0, 0, 0, 0]}>
                  {performanceByWeekday.map((entry) => (
                    <Cell key={entry.day} fill={entry.pnl >= 0 ? "#72f3c6" : "#9cebcf"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
