import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Card from "./ui/Card";
import StatCard from "./ui/StatCard";
import { formatCurrency, formatPercent } from "../utils/formatters";

function AnalyticsCharts({ analytics }) {
  const { summary, equityCurve } = analytics;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net P&L" value={formatCurrency(summary.totalPnl)} accent="mint" />
        <StatCard label="Win Rate" value={formatPercent(summary.winRate)} accent="gold" />
        <StatCard label="Expectancy" value={formatCurrency(summary.expectancy)} accent="mint" />
        <StatCard label="Trades" value={summary.tradeCount} accent="coral" />
      </div>

      <Card
        title="Equity Curve"
        subtitle="A running snapshot of how your P&L evolves across your trade history."
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#72f3c6" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#72f3c6" stopOpacity={0.03} />
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
                stroke="#72f3c6"
                strokeWidth={3}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

export default AnalyticsCharts;
