import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import LoadingState from "../components/ui/LoadingState";
import { useAuth } from "../context/AuthContext";
import analysisService from "../services/analysisService";
import { formatPercent } from "../utils/formatters";
import { getMarketDayKey } from "../utils/advancedAnalytics";

const checkpoints = ["04:30", "06:00", "07:00", "08:00", "09:00", "09:25"];
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dollarCompact = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1
});
const recordedClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
const percent = (value) => value == null ? "—" : formatPercent(value);

function ScanSettings({ scan, busy, onSave }) {
  const [symbols, setSymbols] = useState(scan.symbols.join(", "));
  const [minimum, setMinimum] = useState(String(scan.minDollarVolume));
  const [automatic, setAutomatic] = useState(scan.automatic);

  function save(event) {
    event.preventDefault();
    onSave({
      symbols: [...new Set(symbols.trim().split(/[\s,]+/).filter(Boolean).map((symbol) => symbol.toUpperCase()))],
      minDollarVolume: Number(minimum),
      automatic
    });
  }

  return (
    <form onSubmit={save} className="analysis-panel space-y-4">
      <h2 className="text-lg font-semibold">Scan universe</h2>
      <p className="text-sm text-mist">Use the symbols from your own scanner. Each symbol set and dollar-volume floor has its own baseline.</p>
      <label className="analysis-field">Symbols (up to 100)
        <textarea placeholder="Comma-separated tickers" rows={3} required value={symbols} onChange={(event) => setSymbols(event.target.value)} />
      </label>
      <label className="analysis-field">Minimum premarket dollar volume per symbol
        <input type="number" min="0" max="1000000000" step="1" required value={minimum} onChange={(event) => setMinimum(event.target.value)} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={automatic} onChange={(event) => setAutomatic(event.target.checked)} />
        Collect checkpoints automatically on the server
      </label>
      <button className="ui-button-solid min-h-11 px-4 py-2" disabled={busy || !symbols.trim()}>Save scan settings</button>
    </form>
  );
}

function SnapshotMetrics({ snapshot }) {
  const rows = [
    ["Heat", snapshot.heat ?? "Building baseline"],
    ["Cycle", snapshot.cycle ?? "—"],
    ["Leader gain", percent(snapshot.top[0]?.gain)],
    ["Median top-five gain", percent(snapshot.medianTopFive)],
    ["Up 10% / 20% / 50%", snapshot.counts.join(" / ")],
    ["Eligible dollar volume", dollarCompact.format(snapshot.totalDollarVolume)],
    ["Median move retained", percent(snapshot.medianRetained)]
  ];
  return (
    <section className="analysis-panel space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Session at {snapshot.checkpoint} ET</h2>
        <p className="text-sm text-mist">
          {snapshot.feed.toUpperCase()} · {snapshot.covered}/{snapshot.universeSize} prior closes · {snapshot.baselineSessions} baseline sessions
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-mist">{label}</dt>
            <dd className="mt-1 text-lg tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-mist">Recorded {recordedClock.format(new Date(snapshot.recordedAt))} ET</p>
    </section>
  );
}

function Leaders({ rows }) {
  return (
    <section className="analysis-panel min-w-0">
      <h2 className="mb-3 text-lg font-semibold">Premarket leaders</h2>
      <p className="mb-3 text-sm text-mist">Gains versus prior regular close. Relative volume compares the same ET checkpoint.</p>
      {rows.length ? (
        <div className="overflow-x-auto" role="region" aria-label="Premarket leaderboard" tabIndex={0}>
          <table className="analysis-table">
            <thead><tr>{["Symbol", "Gain", "Premarket shares", "Dollar volume", "Relative volume", "Move held"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.symbol}>
                  <th scope="row">{row.symbol}</th>
                  <td>{row.gain > 0 && "+"}{percent(row.gain)}</td>
                  <td>{integer.format(row.volume)}</td>
                  <td>{dollarCompact.format(row.dollarVolume)}</td>
                  <td>{row.relativeVolume == null ? "—" : `${row.relativeVolume.toFixed(1)}×`}</td>
                  <td>{percent(row.retained)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-mist">No gainers met the liquidity and recent-trade filters at this checkpoint.</p>}
    </section>
  );
}

function HeatHistory({ history, checkpoint }) {
  const hasHeat = history.some(({ score }) => score != null);
  return (
    <section className="analysis-panel min-w-0">
      <h2 className="text-lg font-semibold">{hasHeat ? "Heat history" : "Gainer breadth history"}</h2>
      <p className="mb-4 mt-1 text-sm text-mist">{checkpoint} ET · {hasHeat ? "Percentile score (0–100)" : "Number of names up at least 10%"}</p>
      {history.length ? (
        <div className="h-[210px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 7, right: 9, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="dayKey" tickFormatter={(day) => day.slice(5)} minTickGap={25} tickMargin={6} tick={{ fill: "var(--muted, #a7a7a7)", fontSize: 11 }} />
              <YAxis domain={hasHeat ? [0, 100] : [0, "auto"]} allowDecimals={false} tick={{ fill: "var(--muted, #a7a7a7)", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "white" }} formatter={(value) => Number(value).toFixed(hasHeat ? 1 : 0)} />
              <Line dataKey={hasHeat ? "score" : "breadth"} name={hasHeat ? "Heat" : "Names up 10%"} stroke="var(--accent)" strokeWidth={2}
                dot={history.length === 1} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="text-sm text-mist">Capture a session to start this history.</p>}
    </section>
  );
}

function PremarketWorkspace({ defaultDay }) {
  const [params, setParams] = useSearchParams();
  const today = getMarketDayKey(new Date());
  const requestedDay = params.get("day");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay ?? "") ? requestedDay : defaultDay || today;
  const requestedCheckpoint = params.get("checkpoint");
  const checkpoint = checkpoints.includes(requestedCheckpoint) ? requestedCheckpoint : "09:25";
  const [overview, setOverview] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setOverview(null);
    setLoadError("");
    setActionError("");
    analysisService.getPremarket({ day, checkpoint }).then((data) => { if (current) setOverview(data); })
      .catch((error) => { if (current) setLoadError(error.message); });
    return () => { current = false; };
  }, [day, checkpoint, revision]);

  async function saveSettings(input) {
    setBusy("settings");
    setActionError("");
    try {
      await analysisService.saveScan(input);
      setSettingsOpen(false);
      setRevision((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy("");
    }
  }

  async function capture() {
    setBusy("capture");
    setActionError("");
    try {
      setOverview(await analysisService.capture({ day, checkpoint }));
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy("");
    }
  }

  const snapshot = overview?.snapshot;
  function selectCheckpoint(day, checkpoint) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("day", day);
      next.set("checkpoint", checkpoint);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <section className="analysis-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="analysis-field">Session date (ET)
            <input type="date" value={day} max={today} disabled={Boolean(busy)}
              onChange={(event) => event.target.value && selectCheckpoint(event.target.value, checkpoint)} />
          </label>
          <div className="analysis-tabs" aria-label="Premarket checkpoint">
            {checkpoints.map((time) => (
              <button key={time} aria-pressed={time === checkpoint} disabled={Boolean(busy)}
                onClick={() => selectCheckpoint(day, time)}>{time}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="ui-button min-h-11 px-3" disabled={!overview || Boolean(busy)} aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}>Scan settings</button>
            {!snapshot && (
              <button className="ui-button-solid min-h-11 px-3" disabled={!overview?.scan.symbols.length || Boolean(busy)}
                onClick={capture}>{busy === "capture" ? "Capturing…" : "Capture checkpoint"}</button>
            )}
          </div>
        </div>
      </section>
      {(loadError || actionError) && <p className="analysis-panel text-sm text-coral" role="alert">{loadError || actionError}</p>}
      {overview ? (
        <>
          {(settingsOpen || !overview.scan.symbols.length) && <ScanSettings scan={overview.scan} busy={Boolean(busy)} onSave={saveSettings} />}
          {snapshot ? <SnapshotMetrics snapshot={snapshot} /> : (
            <p className="analysis-panel text-sm text-mist">
              {overview.scan.symbols.length ? `No snapshot for this checkpoint. SIP capture opens ${overview.delayMinutes} minutes after the cutoff.` : "Save your scan universe to collect your first snapshot."}
            </p>
          )}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {snapshot && <Leaders rows={snapshot.top} />}
            <HeatHistory history={overview.history} checkpoint={checkpoint} />
          </div>
        </>
      ) : !loadError && <LoadingState label="Loading premarket conditions…" panel />}
    </div>
  );
}

const sessionViews = {
  premarket: { label: "Premarket", gap: "Last premarket price vs. prior close." },
  wholeDay: { label: "Whole day", gap: "First regular-session price vs. prior close." }
};
const price = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4
});
const displayDay = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function MoverTable({ rows, coverage, title, description, empty, metric, priceKey, priceLabel }) {
  return (
    <section className="analysis-panel min-w-0">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-mist">{description}</p>
      </div>
      {rows.length ? (
        <table className="w-full text-sm tabular-nums" aria-label={title}>
          <thead className="text-mist">
            <tr className="border-b border-white/10">
              <th scope="col" className="py-2 pr-1 text-left font-medium">Ticker</th>
              <th scope="col" className="py-2 pr-1 text-right font-medium">{metric === "gap" ? "Gap" : "Peak gain"}</th>
              <th scope="col" className="py-2 pr-1 text-right font-medium">Prior close</th>
              <th scope="col" className="py-2 text-right font-medium">{priceLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.symbol}>
                <th scope="row" className="py-2.5 pr-1 text-left font-semibold">{row.symbol}</th>
                <td className="py-2.5 pr-1 text-right text-mint">+{percent(row[metric])}</td>
                <td className="py-2.5 pr-1 text-right">{price.format(row.priorClose)}</td>
                <td className="py-2.5 text-right">{price.format(row[priceKey])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="border-t border-white/10 py-3 text-sm text-mist">{coverage ? empty : "No comparable price data for this session."}</p>}
    </section>
  );
}

function HistoricalMovers() {
  const [params, setParams] = useSearchParams();
  const selectedDay = params.get("day");
  const requestedDay = datePattern.test(selectedDay ?? "") ? selectedDay : undefined;
  const view = params.get("session") === "whole-day" ? "wholeDay" : "premarket";
  const today = getMarketDayKey(new Date());
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [heatOpen, setHeatOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer;

    async function load(day, forceCollect = false) {
      try {
        let next = forceCollect ? await analysisService.collectMovers(day, signal) : await analysisService.getMovers(day, signal);
        if (signal.aborted) return;
        if (!forceCollect && next.state === "new") {
          setStatus({ ...next, state: "loading" });
          next = await analysisService.collectMovers(next.day, signal);
        }
        if (signal.aborted) return;
        setStatus(next);
        if (["loading", "waiting"].includes(next.state)) {
          timer = setTimeout(() => load(next.day, next.state === "waiting"), 2000);
        } else if (next.state === "failed" && !next.canRetry) {
          timer = setTimeout(() => load(next.day), 5000);
        }
      } catch (error) {
        if (!signal.aborted) setLoadError(error.message);
      }
    }

    setStatus(null);
    setLoadError("");
    void load(requestedDay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [requestedDay, attempt]);

  async function retry() {
    if (status?.state !== "failed") {
      setAttempt((value) => value + 1);
      return;
    }
    setLoadError("");
    const day = status.day;
    try {
      await analysisService.collectMovers(day);
      setAttempt((value) => value + 1);
    } catch (error) {
      setLoadError(error.message);
    }
  }

  function selectDay(day) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (day) next.set("day", day);
      else next.delete("day");
      return next;
    });
  }

  function selectView(key) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (key === "wholeDay") next.set("session", "whole-day");
      else next.delete("session");
      return next;
    }, { replace: true });
  }

  const session = (!requestedDay || status?.day === requestedDay) ? status?.data?.[view] : null;
  const open = status?.data?.open ?? "09:30";
  const day = requestedDay || status?.day || "";
  const window = view === "premarket" ? `04:00–${open} ET` : "04:00–20:00 ET";
  return (
    <div className="space-y-4">
      <section className="analysis-panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="analysis-field">Trading date (ET)
              <input type="date" max={today} value={day} onChange={(event) => event.target.value && selectDay(event.target.value)} />
            </label>
            <button className="ui-button min-h-11 px-3" aria-label="Previous trading day" disabled={!status?.previous}
              onClick={() => selectDay(status.previous)}>‹</button>
            <button className="ui-button min-h-11 px-3" aria-label="Next trading day" disabled={!status?.next}
              onClick={() => selectDay(status.next)}>›</button>
            {requestedDay && <button className="ui-button min-h-11 px-3" onClick={() => selectDay()}>Latest</button>}
          </div>
          <div className="analysis-tabs" aria-label="Trading session">
            {Object.entries(sessionViews).map(([key, { label }]) => (
              <button key={key} aria-pressed={view === key} onClick={() => selectView(key)}>{label}</button>
            ))}
          </div>
        </div>
        {session && <p className="text-sm text-mist">
          {displayDay.format(new Date(`${day}T00:00:00Z`))} · {window} · {integer.format(session.covered)} symbols with prices and a prior close
        </p>}
      </section>
      {loadError ? (
        <div className="analysis-panel space-y-3" role="alert">
          <p className="text-sm text-coral">{loadError}</p>
          <button className="ui-button min-h-11 px-3" onClick={retry}>Try again</button>
        </div>
      ) : session ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <MoverTable rows={session.gappers} coverage={session.covered} title="Top 10 gappers" description={sessionViews[view].gap}
            empty="No positive gaps in the covered symbols." metric="gap" priceKey="gapPrice"
            priceLabel={view === "premarket" ? "Last price" : "Open price"} />
          <MoverTable rows={session.runners} coverage={session.covered} title={`Runners above 50% (${session.runners.length})`}
            description={`Highest price from ${window} vs. prior close.`} empty="No covered symbol rose more than 50%."
            metric="peakGain" priceKey="high" priceLabel="High" />
        </div>
      ) : ["closed", "incomplete", "failed", "unavailable"].includes(status?.state) ? (
        <section className="analysis-panel space-y-3" role="status">
          <p className="text-sm text-mist">{status.message ?? (status.state === "closed"
            ? "The market was closed on this date." : "This trading day is still in progress. Full-day rankings are available after 20:16 ET.")}</p>
          {(status.state === "unavailable" || status.canRetry) && <button className="ui-button min-h-11 px-3" onClick={retry}>Try again</button>}
        </section>
      ) : <LoadingState label={status?.state === "waiting" ? "Waiting for another date to finish loading…" :
        status ? "Collecting historical SIP bars. This may take a minute…" : "Loading trading date…"} panel />}
      {session && <p className="px-1 text-xs text-mist">
        Alpaca SIP · U.S. exchange-listed symbols in Alpaca’s catalog · Prices adjusted for splits.
        {status.data.withBars > status.data.wholeDay.covered &&
          ` ${integer.format(status.data.withBars - status.data.wholeDay.covered)} symbols with trades lacked a prior-session close.`}
      </p>}
      <details className="analysis-panel" open={heatOpen} onToggle={(event) => setHeatOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">Heat history and scan settings</summary>
        {heatOpen && <div className="mt-4"><PremarketWorkspace defaultDay={day} /></div>}
      </details>
    </div>
  );
}

export default function PremarketPage() {
  const { user } = useAuth();
  return <HistoricalMovers key={user?.id} />;
}
