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
    background: "#120b1a",
    border: "2px solid rgba(89,185,255,0.32)",
    borderRadius: "0px",
    color: "#fff8df"
  };
}

function MiniMetric({ label, value, tone = "text-gold", note }) {
  return (
    <div className="ui-panel px-4 py-4">
      <p className="ui-title text-xs text-mist">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
      {note ? <p className="mt-2 text-sm text-mist">{note}</p> : null}
    </div>
  );
}

function RowMetric({ label, value, tone = "text-mint" }) {
  return (
    <div className="border-b border-cyan/20 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="ui-title text-xs text-[#fff8df]">{label}</span>
        <span className={`text-2xl font-semibold ${tone}`}>{value}</span>
      </div>
    </div>
  );
}

function AnalyticsCharts({ analytics }) {
  const { summary, equityCurve, recentDays, performanceByWeekday } = analytics;
  const recentLeader = recentDays.at(-1);
  const bestWeekday = [...performanceByWeekday].sort((left, right) => right.pnl - left.pnl)[0];
  const worstWeekday = [...performanceByWeekday].sort((left, right) => left.pnl - right.pnl)[0];

  const winLossData = [
    { name: "Wins", value: summary.wins, color: "#56f0a9" },
    { name: "Losses", value: summary.losses, color: "#ff6b6b" }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net P&L"
          value={formatCurrency(summary.totalPnl)}
          accent={summary.totalPnl >= 0 ? "mint" : "coral"}
        />
        <StatCard label="Win Rate" value={formatPercent(summary.winRate)} accent="mint" />
        <StatCard
          label="Expectancy"
          value={formatCurrency(summary.expectancy)}
          accent={summary.expectancy >= 0 ? "mint" : "coral"}
        />
        <StatCard label="Trades" value={summary.tradeCount} accent="neutral" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.28fr_0.64fr_0.64fr]">
        <Card
          title="Equity Console"
          subtitle="A running snapshot of how your P&L evolves across the full trade history."
          className="xl:row-span-2"
        >
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <MiniMetric
              label="Leader"
              value={bestWeekday?.day || "---"}
              tone={bestWeekday?.pnl >= 0 ? "text-mint" : "text-coral"}
              note={bestWeekday ? formatCurrency(bestWeekday.pnl) : "No data"}
            />
            <MiniMetric
              label="Laggard"
              value={worstWeekday?.day || "---"}
              tone="text-coral"
              note={worstWeekday ? formatCurrency(worstWeekday.pnl) : "No data"}
            />
            <MiniMetric
              label="Recent Day"
              value={recentLeader ? formatCurrency(recentLeader.pnl) : "$0.00"}
              tone={recentLeader?.pnl >= 0 ? "text-mint" : "text-coral"}
              note={recentLeader ? `${recentLeader.trades} trades` : "No recent data"}
            />
          </div>

          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#59b9ff" stopOpacity={0.38} />
                    <stop offset="45%" stopColor="#56f0a9" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#56f0a9" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(89,185,255,0.16)" vertical={false} />
                <XAxis dataKey="date" stroke="#59b9ff" tickLine={false} axisLine={false} />
                <YAxis stroke="#59b9ff" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#56f0a9"
                  strokeWidth={3}
                  fill="url(#equityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Win vs Loss" subtitle="Fast pulse on trade balance.">
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

        <Card title="Volatility / Stress" subtitle="A quick feel for pressure and tempo.">
          <div className="space-y-6 pt-2">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-[#fff8df]">Winning Hold</span>
                <span className="text-[#59b9ff]">
                  {Number(summary.averageWinningHoldMinutes.toFixed(1))} min
                </span>
              </div>
              <div className="h-3 bg-black/35">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#59b9ff,#56f0a9)]"
                  style={{ width: `${Math.min(100, summary.averageWinningHoldMinutes * 6)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="ui-title text-xs text-[#fff8df]">Losing Hold</span>
                <span className="text-coral">
                  {Number(summary.averageLosingHoldMinutes.toFixed(1))} min
                </span>
              </div>
              <div className="h-3 bg-black/35">
                <div
                  className="h-3 bg-[linear-gradient(90deg,#ff6b6b,#ff8a76)]"
                  style={{ width: `${Math.min(100, summary.averageLosingHoldMinutes * 6)}%` }}
                />
              </div>
            </div>

            <MiniMetric
              label="Loss Rate"
              value={formatPercent(summary.lossRate)}
              tone="text-coral"
              note="Current stress reading"
            />
          </div>
        </Card>

        <Card title="Recent Sessions" subtitle="The latest daily snapshots.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {recentDays.map((day) => (
              <div key={day.date} className="ui-panel bg-[linear-gradient(180deg,rgba(138,103,255,0.12),rgba(18,12,27,0.96))] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="ui-title text-sm text-[#fff8df]">{day.weekday}</p>
                    <p className="mt-1 text-sm text-mist">{day.date}</p>
                  </div>
                  <div className={`text-2xl font-semibold ${day.pnl >= 0 ? "text-mint" : "text-coral"}`}>
                    {formatCurrency(day.pnl)}
                  </div>
                </div>
                <p className="mt-3 text-sm text-mist">
                  {day.trades} trade{day.trades === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Leadership Board" subtitle="Performance by weekday.">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceByWeekday}>
                <CartesianGrid stroke="rgba(89,185,255,0.14)" vertical={false} />
                <XAxis dataKey="day" stroke="#59b9ff" tickLine={false} axisLine={false} />
                <YAxis stroke="#59b9ff" tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Bar dataKey="pnl" radius={[0, 0, 0, 0]}>
                  {performanceByWeekday.map((entry) => (
                    <Cell
                      key={entry.day}
                      fill={entry.pnl >= 0 ? "#56f0a9" : "#ff6b6b"}
                    />
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
