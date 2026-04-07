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
  const { summary, equityCurve, lastSevenDays } = analytics;
  const winRateAccent =
    summary.winRate >= 68 ? "mint" : summary.winRate < 50 ? "coral" : "warning";
  const averageTradeDayData = lastSevenDays.map((day) => ({
    ...day,
    averagePnl: day.trades ? Number((day.pnl / day.trades).toFixed(2)) : 0
  }));

  return (
    <div className="space-y-6">
      <div className="ui-panel p-5">
        <div className="grid gap-3 md:grid-cols-7">
          {lastSevenDays.map((day) => (
            <div key={day.date} className="ui-panel px-4 py-4">
              <p className="ui-title text-xs uppercase text-[#ffc14d]">{day.weekday}</p>
              <p className="mt-2 text-sm text-white/70">{day.label}</p>
              <p
                className={`mt-4 text-2xl font-semibold ${
                  day.trades === 0 ? "text-mist" : day.pnl >= 0 ? "text-mint" : "text-coral"
                }`}
              >
                {formatCurrency(day.pnl)}
              </p>
              <p className="mt-2 text-xs text-white/70">
                {day.trades} trade{day.trades === 1 ? "" : "s"}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.28fr_0.64fr_0.64fr]">
        <Card
          title="Cumulative P&L"
          className="xl:row-span-2"
        >
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            <MiniMetric
              label="NET P&L TOTAL"
              value={formatCurrency(summary.totalPnl)}
              tone={summary.totalPnl >= 0 ? "text-mint" : "text-coral"}
            />
            <MiniMetric
              label="NET P&L MONTH"
              value={formatCurrency(summary.totalMonthPnl)}
              tone={summary.totalMonthPnl >= 0 ? "text-mint" : "text-coral"}
            />
            <MiniMetric
              label="NET P&L WEEK"
              value={formatCurrency(summary.totalWeekPnl)}
              tone={summary.totalWeekPnl >= 0 ? "text-mint" : "text-coral"}
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
                <XAxis
                  dataKey="date"
                  stroke="#6e7585"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#f3f3f3", fontSize: 10 }}
                />
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

        <Card title="WINNING VS LOSING TRADES">
          <div className="grid grid-cols-3 gap-3">
            <MiniMetric label="WINS" value={summary.wins} tone="text-mint" />
            <MiniMetric label="LOSSES" value={summary.losses} tone="text-coral" />
            <MiniMetric label="WIN RATE" value={formatPercent(summary.winRate)} tone={winRateAccent === "mint" ? "text-mint" : winRateAccent === "coral" ? "text-coral" : "text-[#ffc14d]"} />
          </div>
        </Card>

        <Card title="HOLD TIME WINNING TRADES VS LOSING TRADES">
          <div className="grid gap-3 pt-2 md:grid-cols-2">
            <MiniMetric
              label="WINNING HOLD"
              value={`${Number(summary.averageWinningHoldMinutes.toFixed(1))} min`}
              tone="text-mint"
            />
            <MiniMetric
              label="LOSING HOLD"
              value={`${Number(summary.averageLosingHoldMinutes.toFixed(1))} min`}
              tone="text-coral"
            />
          </div>
        </Card>

        <Card title="AVERAGE TRADE P&L">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={averageTradeDayData}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#a9a9a9"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#f3f3f3", fontSize: 11 }}
                />
                <YAxis
                  stroke="#a9a9a9"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                  tick={{ fill: "#f3f3f3", fontSize: 11 }}
                />
                <Tooltip contentStyle={tooltipStyle()} />
                <Bar dataKey="averagePnl" barSize={32} radius={[0, 0, 0, 0]}>
                  {averageTradeDayData.map((entry) => (
                    <Cell key={entry.date} fill={entry.averagePnl >= 0 ? "#56f0a9" : "#ff6b6b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="LARGEST GAIN VS LARGEST LOSS">
          <div className="grid gap-3 pt-2 md:grid-cols-2">
            <MiniMetric
              label="LARGEST GAIN"
              value={formatCurrency(summary.largestWin)}
              tone="text-mint"
            />
            <MiniMetric
              label="LARGEST LOSS"
              value={formatCurrency(summary.largestLoss)}
              tone="text-coral"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AnalyticsCharts;
