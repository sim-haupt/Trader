import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import TradeReviewCharts, { BlindEntryChart } from "../components/TradeReviewCharts";
import LoadingState from "../components/ui/LoadingState";
import { useAuth } from "../context/AuthContext";
import analysisService from "../services/analysisService";
import { clearTradeCaches } from "../services/tradeService";
import { formatCurrency, formatPercent } from "../utils/formatters";

const accountClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
const criteria = [
  ["setupFit", "Setup fit"],
  ["timing", "Trigger and timing"],
  ["invalidation", "Clear invalidation"],
  ["liquidity", "Liquidity at entry"]
];
const numberFields = [
  ["plannedStop", "Original stop price"],
  ["plannedInitialRisk", "Original planned risk ($)"],
  ["intendedPrice", "Intended entry price"]
];

function GradeForm({ review, onSave, busy, hasBars }) {
  const [scores, setScores] = useState({});
  const [retake, setRetake] = useState("");
  const [notes, setNotes] = useState("");
  const [prices, setPrices] = useState({});
  const total = criteria.reduce((sum, [key]) => sum + (review?.[key] ?? scores[key] ?? 0), 0);
  const ready = criteria.every(([key]) => scores[key] !== undefined) && retake !== "" && notes.trim();

  function submit(event) {
    event.preventDefault();
    onSave({
      ...scores,
      wouldRetake: retake === "yes",
      notes,
      ...Object.fromEntries(numberFields.map(([key]) => [key, prices[key] ? Number(prices[key]) : null]))
    });
  }

  return (
    <form onSubmit={submit} className="analysis-panel space-y-4">
      <div className="flex justify-between gap-3">
        <h2 className="text-lg font-semibold">{review ? "Saved entry grade" : "Grade this entry"}</h2>
        <span className="tabular-nums text-lg">{Object.keys(scores).length || review ? `${total}/8` : "— / 8"}</span>
      </div>
      {!review && <p className="text-sm text-mist">0 Poor · 1 Mixed · 2 Strong</p>}
      {criteria.map(([key, label]) => (
        <fieldset key={key} className="flex items-center justify-between gap-3" disabled={Boolean(review) || busy}>
          <legend className="sr-only">{label}</legend>
          <span aria-hidden="true" className="text-sm">{label}</span>
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((value) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name={key} value={value} className="peer sr-only"
                  checked={(review?.[key] ?? scores[key]) === value}
                  onChange={() => setScores((current) => ({ ...current, [key]: value }))} />
                <span className="analysis-choice peer-checked:border-b-[var(--accent)] peer-checked:text-white peer-focus-visible:outline">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {review ? (
        <div className="space-y-2 border-t border-[var(--line)] pt-3 text-sm">
          <p>Would take again · {review.wouldRetake ? "Yes" : "No"}</p>
          <p className="whitespace-pre-wrap break-words text-mist">{review.notes}</p>
          {numberFields.map(([key, label]) => review[key] != null && (
            <p key={key}>{label} · {formatCurrency(Number(review[key]))}</p>
          ))}
        </div>
      ) : (
        <>
          <label className="analysis-field">Would you take it again?
            <select required value={retake} onChange={(event) => setRetake(event.target.value)} disabled={busy}>
              <option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </label>
          <label className="analysis-field">What did you see?
            <textarea required maxLength={4000} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} />
          </label>
          <details className="text-sm">
            <summary className="cursor-pointer">Original trade plan (optional)</summary>
            <div className="mt-3 grid gap-3">
              {numberFields.map(([key, label]) => (
                <label key={key} className="analysis-field">{label}
                  <input type="number" min="0.0001" max="1000000000" step="0.0001" disabled={busy}
                    value={prices[key] ?? ""} onChange={(event) => setPrices((current) => ({ ...current, [key]: event.target.value }))} />
                </label>
              ))}
            </div>
          </details>
          <button className="ui-button-solid min-h-11 w-full px-4 py-2" disabled={!ready || busy || !hasBars}>
            {busy ? "Saving grade…" : "Save grade and reveal"}
          </button>
        </>
      )}
    </form>
  );
}

function Outcome({ entry, outcome }) {
  const [notes, setNotes] = useState(outcome.postRevealNotes ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const { analytics } = outcome;
  const risk = Number(entry.review.plannedInitialRisk);
  const metrics = [
    ["Net P&L", outcome.netPnl == null ? "—" : formatCurrency(Number(outcome.netPnl))],
    ["Net R", outcome.netPnl == null || !(risk > 0) ? "—" : `${(Number(outcome.netPnl) / risk).toFixed(2)} R`],
    ["Favorable excursion", analytics.mfe == null ? "—" : formatCurrency(analytics.mfe)],
    ["Adverse excursion", analytics.mae == null ? "—" : formatCurrency(analytics.mae)],
    ["Spread per share", analytics.spreadPerShare == null ? "—" : `$${analytics.spreadPerShare.toFixed(4)}`],
    ["Slippage per share", analytics.slippagePerShare == null ? "—" : `$${analytics.slippagePerShare.toFixed(4)}`],
    ...analytics.checkpoints.map(({ minutes, movePercent }) => [
      `Move after ${minutes}m`, movePercent === null ? "—" : formatPercent(movePercent)
    ])
  ];

  async function saveReflection(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await analysisService.saveReflection(entry.id, notes);
      setStatus("Reflection saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="analysis-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Trade outcome</h2>
          <Link className="ui-button px-3 py-2 text-sm" to={`/trades/${entry.id}`}>Open execution details</Link>
        </div>
        {outcome.dataMessage && <p className="text-sm text-mist">{outcome.dataMessage}</p>}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {metrics.map(([label, value]) => (
            <div key={label}><dt className="text-sm text-mist">{label}</dt><dd className="mt-1 tabular-nums">{value}</dd></div>
          ))}
        </dl>
        <p className="text-sm text-mist">Price moves are direction-adjusted. Excursions use completed bars between fills and are before costs.</p>
      </section>
      <TradeReviewCharts trade={{
        id: entry.id, symbol: entry.symbol, side: entry.side,
        entryDate: entry.fill.time, entryPrice: outcome.entryPrice, quantity: outcome.quantity,
        exitDate: outcome.exitDate, exitPrice: outcome.exitPrice, executions: outcome.executions
      }} title="Full execution chart" />
      <form className="analysis-panel space-y-3" onSubmit={saveReflection}>
        <label className="analysis-field">Post-reveal reflection
          <textarea rows={3} maxLength={4000} value={notes} onChange={(event) => { setNotes(event.target.value); setStatus(""); }} />
        </label>
        <button className="ui-button min-h-11 px-3 py-2" disabled={saving}>Save reflection</button>
        {status && <p role="status" className="text-sm text-mist">{status}</p>}
      </form>
    </div>
  );
}

function EntryReview({ id, onGraded }) {
  const [entry, setEntry] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    analysisService.getEntry(id).then((data) => { if (current) setEntry(data); })
      .catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [id, revision]);

  async function reveal(grade) {
    setBusy(true);
    setError("");
    try {
      if (grade) {
        const review = await analysisService.saveGrade(id, grade);
        setEntry((current) => ({ ...current, review }));
        clearTradeCaches();
        onGraded();
      }
      const result = await analysisService.getOutcome(id);
      setOutcome(result);
      clearTradeCaches();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (!entry) return error ? <p className="analysis-panel text-sm text-coral" role="alert">{error}</p> : <LoadingState label="Loading entry…" panel />;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{entry.symbol} <span className="text-sm font-normal text-mist">{entry.side}</span></h2>
        <p className="text-sm text-mist tabular-nums">{accountClock.format(new Date(entry.fill.time))} ET{entry.fill.price != null && ` · ${formatCurrency(entry.fill.price)}`}{entry.fill.approximate ? " · Reported entry time" : ""}</p>
      </div>
      {error && <p className="text-sm text-coral" role="alert">{error}</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          {outcome ? <Outcome entry={entry} outcome={outcome} /> : <BlindEntryChart entry={entry} />}
          {!entry.bars.length && entry.barsError && !outcome && (
            <button className="ui-button mt-3 px-3 py-2" onClick={() => setRevision((value) => value + 1)}>Retry chart</button>
          )}
        </div>
        <div className="space-y-3">
          <GradeForm review={entry.review} busy={busy} onSave={reveal} hasBars={entry.bars.length > 0} />
          {entry.review && !outcome && (
            <button className="ui-button-solid min-h-11 w-full px-4 py-2" disabled={busy} onClick={() => reveal()}>
              {busy ? "Loading outcome…" : "Reveal outcome"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function GradingWorkspace() {
  const [params, setParams] = useSearchParams();
  const [graded, setGraded] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [queue, setQueue] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const id = params.get("trade") || queue?.trades[0]?.id;

  useEffect(() => {
    let current = true;
    setError("");
    analysisService.getQueue({ graded, ...cursor }).then((data) => { if (current) setQueue(data); })
      .catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [graded, cursor, revision]);

  function selectMode(next) {
    if (next === graded) return;
    setGraded(next);
    setCursor(null);
    setQueue(null);
    setParams({});
  }

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="analysis-panel min-w-0 space-y-3">
          <button type="button" className="ui-button min-h-11 px-3 text-sm lg:hidden"
            aria-expanded={browse} aria-controls="grade-queue-list" onClick={() => setBrowse((open) => !open)}>
            {browse ? "Hide trade queue" : "Browse trades"}
          </button>
          <div id="grade-queue-list" className={`${browse ? "block" : "hidden"} space-y-3 lg:block`}>
            <div className="analysis-tabs" aria-label="Trade status">
              <button aria-pressed={!graded} onClick={() => selectMode(false)}>To grade</button>
              <button aria-pressed={graded} onClick={() => selectMode(true)}>Graded</button>
            </div>
            {error && <p className="text-sm text-coral" role="alert">{error}</p>}
            {queue ? (
              <>
                <div className="grid max-h-64 gap-1 overflow-y-auto lg:max-h-[60vh]">
                  {queue.trades.map((trade) => (
                    <button key={trade.id} aria-pressed={id === trade.id} className="analysis-queue-row"
                      onClick={() => { setParams({ trade: trade.id }); setBrowse(false); }}>
                      <span className="font-semibold">{trade.symbol}</span>
                      <span className="text-xs text-mist">{accountClock.format(new Date(trade.entryDate))}</span>
                    </button>
                  ))}
                </div>
                {queue.hasMore && <button className="ui-button min-h-11 px-3" onClick={() => {
                  const last = queue.trades.at(-1);
                  setCursor({ entryDate: last.entryDate, id: last.id });
                  setParams({});
                  setQueue(null);
                }}>Older trades</button>}
                {cursor && <button className="ui-button min-h-11 px-3" onClick={() => { setCursor(null); setParams({}); setQueue(null); }}>Latest trades</button>}
                {!queue.trades.length && <p className="text-sm text-mist">{graded ? "No graded trades yet." : "No trades waiting to be graded."}</p>}
              </>
            ) : !error && <p className="text-sm text-mist">Loading trades…</p>}
          </div>
        </aside>
        {id && <EntryReview key={id} id={id} onGraded={() => {
          setParams({ trade: id }, { replace: true });
          setRevision((value) => value + 1);
        }} />}
      </div>
    </div>
  );
}

export default function EntryGradingPage() {
  const { user } = useAuth();
  return <GradingWorkspace key={`${user?.id}:${user?.activeAccountScope}:${user?.liveDataStartDate}`} />;
}
