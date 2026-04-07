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
    background: "rgba(25,30,43,0.96)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    color: "#f5f7fb",
    boxShadow: "0 18px 40px rgba(0,0,0,0.28)"
  };
}

function MiniMetric({ label, value, tone = "text-white", note }) {
  return (
    <div className="rounded-[12px] border border-[#e5e7eb42] bg-white/[0.025] px-4 py-4">
      <p className="ui-title text-[10px] text-white/48">{label}</p>
      <p className={`mt-3 text-3xl font-bold tracking-[-0.04em] ${tone}`}>{value}</p>
      {note ? <p className="mt-2 text-sm text-white/56">{note}</p> : null}
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
                    <stop offset="0%" stopColor="#2be28c" stopOpacity={0.22} />
                    <stop offset="55%" stopColor="#2be28c" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#2be28c" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#8e96a6"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                />
                <YAxis stroke="#8e96a6" tickLine={false} axisLine={false} tick={{ fill: "#c6cedb", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle()} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#18c87a"
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
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="#8e96a6"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                />
                <YAxis
                  stroke="#8e96a6"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                  tick={{ fill: "#c6cedb", fontSize: 11 }}
                />
                <Tooltip contentStyle={tooltipStyle()} />
                <Bar dataKey="averagePnl" barSize={26} radius={[6, 6, 0, 0]}>
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
