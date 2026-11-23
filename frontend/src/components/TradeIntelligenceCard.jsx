import { useState } from "react";
import { Link } from "react-router-dom";
import Card from "./ui/Card";
import analysisService from "../services/analysisService";
import { clearTradeCaches } from "../services/tradeService";
import { formatCurrency } from "../utils/formatters";
import { getExecutionFacts } from "../utils/performanceIntelligence";

const missing = "–";
const amount = (value) => value == null ? missing : `$${Number(value).toFixed(4)}`;
const money = (value) => value == null ? missing : formatCurrency(Number(value));
const percent = (value) => value == null ? missing : `${Number(value).toFixed(1)}%`;
const number = (value) => value == null ? missing : Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });

function TradePlan({ trade, facts, busy, onSave }) {
  const [target, setTarget] = useState(trade.analysis?.intendedExit ?? "");
  const [stopExecutionId, setStopExecutionId] = useState(trade.analysis?.stopExecutionId ?? "");
  const rows = [
    ["First entry fill", amount(trade.entryReview?.intendedPrice), amount(facts.first?.price), amount(facts.entrySlippage)],
    ["Last exit fill", amount(trade.analysis?.intendedExit), amount(facts.last?.price), amount(facts.exitSlippage)],
    ["Identified stop fill", amount(facts.plannedStop), amount(facts.stopFill?.price), amount(facts.stopSlippage)]
  ];

  return (
    <div className="space-y-3">
      <div className="overflow-auto">
        <table className="analysis-table">
          <thead><tr>{["Execution", "Planned", "Actual", "Adverse slippage"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(([label, ...values]) => <tr key={label}>
            <th scope="row">{label}</th>{values.map((value, index) => <td key={index}>{value}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-sm text-mist">Use the original plan. Positive slippage means a worse fill for the trade direction.</p>
      {!trade.entryReview?.intendedPrice && (
        <Link className="text-sm text-[var(--accent)]" to={`/trade-reviews/grade?trade=${trade.id}`}>Open blind review and entry plan</Link>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        onSave({ intendedExit: target === "" ? null : Number(target), stopExecutionId: stopExecutionId || null });
      }}>
        <label className="analysis-field">Planned exit price
          <input type="number" min=".0001" step=".0001" max="1000000000" value={target}
            onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="analysis-field max-w-full">Actual stop fill
          <select value={stopExecutionId} onChange={(event) => setStopExecutionId(event.target.value)}>
            <option value="">No confirmed stop fill</option>
            {facts.exitFills.map((fill) => <option key={fill.id} value={fill.id}>Fill {fill.sequence} · {amount(fill.price)} × {fill.quantity}</option>)}
          </select>
        </label>
        <button type="submit" className="ui-button min-h-11 px-4" disabled={busy}>Save exit plan</button>
      </form>
    </div>
  );
}

export default function TradeIntelligenceCard({ trade, onChange, onApplySetup }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const facts = getExecutionFacts(trade);
  const snapshot = trade.analysis?.snapshot;
  const execution = trade.analysis?.execution;
  const excursionTime = (point) => {
    if (!point) return missing;
    const minutes = (point.time * 1000 - new Date(facts.first?.occurredAt ?? trade.entryDate).getTime()) / 60_000;
    return minutes >= 0 ? `${minutes.toFixed(1)} min` : missing;
  };
  const metrics = [
    ["Entry efficiency", percent(facts.entryEfficiency)],
    ["Exit efficiency", percent(facts.exitEfficiency)],
    ["MFE / MAE", `${money(facts.grossMfe)} / ${money(facts.grossMae)}`],
    ["Time to MFE / MAE", `${excursionTime(execution?.mfePoint)} / ${excursionTime(execution?.maePoint)}`],
    ["Fill vs entry quote midpoint", amount(facts.entryVsMidpoint)],
    ["Fill vs exit quote midpoint", amount(facts.exitVsMidpoint)],
    ["Entry bid/ask spread", amount(execution?.spreadPerShare ?? trade.entryReview?.outcome?.spreadPerShare)],
    ["Actual entry / exit fills", facts.hasImportedFills ? `${facts.entryFills.length} / ${facts.exitFills.length}` : missing],
    ["Commission / fees", `${money(trade.commissions)} / ${money(trade.fees)}`]
  ];
  const market = snapshot ? [
    ["Entry price reference", amount(snapshot.price)],
    ["Entry vs prior close", percent(trade.entryPriorCloseDiffPercent)],
    ["Premarket gap", percent(snapshot.premarketGap)],
    ["Premarket shares", number(snapshot.premarketVolume)],
    ["Same-time relative volume", snapshot.relativeVolume == null ? missing : `${number(snapshot.relativeVolume)}×`],
    ["VWAP distance", percent(snapshot.vwapDistance)],
    ["EMA 9 / 20", `${amount(snapshot.ema9)} / ${amount(snapshot.ema20)}`],
    ["Daily SMA 50 / 200", `${amount(snapshot.sma50)} / ${amount(snapshot.sma200)}`],
    ["Daily ATR (14)", percent(snapshot.atrPercent)],
    ["RSI (14) / MACD", `${number(snapshot.rsi)} / ${number(snapshot.macd)}`],
    ["SPY direction / move", `${snapshot.marketDirection ?? missing} / ${percent(snapshot.benchmarkReturn)}`],
    ["Benchmark volatility regime", snapshot.regime ?? missing],
    ["Intraday price range", percent(snapshot.rangePercent)],
    ["Historical float", number(trade.instrumentFloat)],
    ["Latest news category", snapshot.catalyst ?? missing]
  ] : [];

  async function run(action, message, updateAnalysis = true) {
    setBusy(true);
    setStatus("");
    try {
      const analysis = await action();
      if (updateAnalysis) {
        onChange(analysis);
        clearTradeCaches();
      }
      setStatus(message);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function factsGrid(rows) {
    return <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">{rows.map(([label, value]) => (
      <div key={label}><dt className="text-sm text-mist">{label}</dt><dd className="mt-1 tabular-nums">{value}</dd></div>
    ))}</dl>;
  }

  return (
    <Card title="Entry context and execution quality"
      action={<button type="button" className="ui-button min-h-11 px-4" disabled={busy}
        onClick={() => run(() => analysisService.refreshTrade(trade.id), "Historical analysis saved.")}>
        {busy ? "Working…" : trade.analysis?.collectedAt ? "Refresh historical data" : "Collect historical data"}
      </button>} bodyClassName="gap-5">
      {status && <p role="status" className="text-sm text-mist">{status}</p>}
      {factsGrid(metrics)}
      <details>
        <summary className="cursor-pointer text-sm">Planned and actual prices</summary>
        <div className="mt-4"><TradePlan trade={trade} facts={facts} busy={busy}
          onSave={(plan) => run(() => analysisService.saveTradePlan(trade.id, plan), "Exit plan saved.")} /></div>
      </details>
      {snapshot && (
        <details open>
          <summary className="mb-4 cursor-pointer text-sm">Market snapshot at entry · SIP</summary>
          {factsGrid(market)}
          {snapshot.setupCandidate && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="text-sm text-mist">Rule-based setup candidate · {snapshot.setupCandidate}</p>
              {snapshot.setupCandidate !== trade.setup && (
                <button type="button" className="ui-button min-h-11 px-3" disabled={busy}
                  onClick={() => run(() => onApplySetup(snapshot.setupCandidate), "Setup applied.", false)}>Apply setup</button>
              )}
            </div>
          )}
          {snapshot.news?.length > 0 && <ul className="mt-4 space-y-2 text-sm text-mist">
            {snapshot.news.map((item) => <li key={`${item.publishedAt}:${item.headline}`}>
              {item.headline} · {item.source} · {new Date(item.publishedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
            </li>)}
          </ul>}
        </details>
      )}
    </Card>
  );
}
