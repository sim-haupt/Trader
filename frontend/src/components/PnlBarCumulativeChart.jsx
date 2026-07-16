import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "../utils/formatters";

const BAR_GREEN = "#22b58f";
const BAR_RED = "#b44b4b";

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function PnlBarTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  dailyLabel,
  cumulativeLabel
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  const daily = asNumber(point?.__daily);
  const cumulative = asNumber(point?.__cumulative);
  const dailyTone = daily < 0 ? "text-coral" : daily > 0 ? "text-mint" : "text-white";
  const cumulativeTone = cumulative < 0 ? "text-coral" : cumulative > 0 ? "text-mint" : "text-white";

  return (
    <div className="rounded-[6px] border border-[var(--line)] bg-[#050505] px-3 py-2 text-xs text-phosphor shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <div className="font-semibold text-white">{labelFormatter ? labelFormatter(point, label) : point?.__label || label}</div>
      <div className={`mt-1 font-semibold ${dailyTone}`}>{dailyLabel}: {valueFormatter(daily)}</div>
      <div className={`font-semibold ${cumulativeTone}`}>{cumulativeLabel}: {valueFormatter(cumulative)}</div>
    </div>
  );
}

export function ChartViewSwitch({ value, onChange, className = "" }) {
  return (
    <div className={`inline-flex overflow-hidden rounded-[6px] border border-[var(--line)] bg-black/40 p-0.5 ${className}`}>
      {[
        { key: "BARS", label: "Bars" },
        { key: "CURVE", label: "Curve" }
      ].map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`rounded-[4px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
            value === option.key ? "bg-white/12 text-white" : "text-white/54 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function PnlBarCumulativeChart({
  data = [],
  dailyKey = "pnl",
  cumulativeKey,
  labelKey = "label",
  height = "100%",
  xTickFormatter,
  valueFormatter = formatCurrency,
  yAxisWidth = 72,
  labelFormatter,
  dailyLabel = "Daily",
  cumulativeLabel = "Cumulative",
  barSize = 18
}) {
  const preparedData = useMemo(() => {
    let running = 0;

    return data.map((point, index) => {
      const daily = asNumber(point?.[dailyKey]);
      running = Number((running + daily).toFixed(4));
      const cumulative = cumulativeKey ? asNumber(point?.[cumulativeKey]) : running;
      const label = point?.[labelKey] ?? point?.date ?? point?.dayKey ?? index + 1;

      return {
        ...point,
        __daily: daily,
        __cumulative: cumulative,
        __label: label
      };
    });
  }, [cumulativeKey, dailyKey, data, labelKey]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={preparedData} margin={{ top: 8, right: 8, left: 0, bottom: 16 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="__label"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#c6cedb", fontSize: 11 }}
          minTickGap={18}
          tickFormatter={xTickFormatter}
        />
        <YAxis
          width={yAxisWidth}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#c6cedb", fontSize: 11 }}
          tickFormatter={valueFormatter}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
          content={
            <PnlBarTooltip
              labelFormatter={labelFormatter}
              valueFormatter={valueFormatter}
              dailyLabel={dailyLabel}
              cumulativeLabel={cumulativeLabel}
            />
          }
          offset={14}
          allowEscapeViewBox={{ x: true, y: true }}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.56)" strokeDasharray="5 5" />
        <Bar dataKey="__cumulative" barSize={barSize} radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {preparedData.map((entry, index) => (
            <Cell
              key={`${entry.__label}-${index}`}
              fill={entry.__cumulative >= 0 ? BAR_GREEN : BAR_RED}
              fillOpacity={0.86}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
