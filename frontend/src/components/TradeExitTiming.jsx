import { useState } from "react";
import Card from "./ui/Card";
import analysisService from "../services/analysisService";
import { formatCurrency } from "../utils/formatters";

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 });
const tone = (delta) => delta > 0 ? "text-mint" : delta < 0 ? "text-coral" : "text-mist";
const exitLabel = (minutes) => minutes === 0 ? "Actual exit" : `${Math.abs(minutes)} min ${minutes < 0 ? "earlier" : "later"}`;

export default function TradeExitTiming({ tradeId }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      setResult(await analysisService.getExitTiming(tradeId));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const scenarios = result?.rows;
  const rows = scenarios && [...scenarios.slice(0, 4), { minutes: 0, time: result.exit, net: result.actualNet }, ...scenarios.slice(4)];
  const unavailable = scenarios && scenarios.every((row) => row.reason);
  const best = scenarios?.reduce((leader, row) => row.delta > (leader?.delta ?? 0.005) ? row : leader, null);

  return (
    <Card title="Exit timing" subtitle="Compare the actual exit with closing the position 1, 5, 15, or 30 minutes earlier or later."
      action={(!result || error || unavailable) && <button type="button" className="ui-button min-h-11 px-4" disabled={busy} onClick={load}>
        {busy ? "Loading historical prices…" : "Compare exits"}
      </button>}>
      {error && <p className="text-sm text-coral" role="alert">{error}</p>}
      {result?.reason && <p className="text-sm text-mist" role="status">{result.reason}</p>}
      {unavailable && <p className="mb-3 text-sm text-mist" role="status">No exit prices were available for the comparison times.</p>}
      {best && <p className="mb-3 text-sm">Best tested exit was {exitLabel(best.minutes)}, with <span className="text-mint">{formatCurrency(best.delta)} more net P&amp;L</span>.</p>}
      {rows && (
        <>
          <div className="overflow-x-auto" role="region" aria-label="Exit timing comparison" tabIndex={0}>
            <table className="analysis-table">
              <thead><tr>{["Exit time (ET)", "Candle close", "Net P&L", "Vs. actual"].map((label) =>
                <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.minutes} className={row.minutes === 0 ? "bg-white/[0.06] font-semibold" : undefined}>
                  <th scope="row">
                    {exitLabel(row.minutes)}
                    <div className="text-xs font-normal text-mist">{clock.format(row.time)}</div>
                  </th>
                  {row.reason ? <td colSpan={3} className="text-mist">{row.reason}</td> : <>
                    <td>{row.price == null ? "–" : price.format(row.price)}</td>
                    <td>{formatCurrency(row.net)}</td>
                    <td className={tone(row.delta)}>{row.delta == null ? "–" : `${row.delta > 0 ? "+" : ""}${formatCurrency(row.delta)}`}</td>
                  </>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-mist">
            Estimates keep fills before the hypothetical exit and use the trade’s recorded costs. A later exit moves the final closing fills. Prices come from completed one-minute candles.
            {result.approximate && " Entry and exit use the reported trade prices."}
            {result.feed && ` Feed: ${result.feed.toUpperCase()}.`}
          </p>
        </>
      )}
    </Card>
  );
}
