import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadingState from "../components/ui/LoadingState";
import analysisService from "../services/analysisService";
import { formatPercent } from "../utils/formatters";
import { getMarketDayKey } from "../utils/advancedAnalytics";

const sessions = [
  { key: "premarket", label: "Premarket", description: "Gaps use the last price before the regular open." },
  { key: "wholeDay", label: "Whole day", description: "Gaps use the regular-session open. Runners include extended hours." }
];
const displayDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const integer = new Intl.NumberFormat("en-US");

function DailyMovers({ rows, session }) {
  return (
    <div className="overflow-x-auto" role="region" aria-label={`${session.label} history`} tabIndex={0}>
      <table className="w-full text-sm tabular-nums">
        <thead className="text-mist">
          <tr className="border-b border-[var(--line)]">
            <th scope="col" className="py-2 pr-3 text-left font-medium">Trading date</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Runners &gt;50%</th>
            <th scope="col" className="py-2 text-left font-medium">Top gaps</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map(({ day, [session.key]: data }) => (
            <tr key={day}>
              <th scope="row" className="whitespace-nowrap py-3 pr-3 text-left font-medium">
                <time dateTime={day}>{displayDate.format(new Date(`${day}T00:00:00Z`))}</time>
                {data && <span className="block max-w-28 truncate text-xs font-normal text-mist sm:max-w-60" title={data.source}>{data.source}</span>}
              </th>
              <td className="py-3 pr-3 text-right">{data?.runnerCount == null ? "—" : integer.format(data.runnerCount)}</td>
              <td className="py-3">
                {data?.gappers.length ? (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {data.gappers.map(({ gap, symbol }, index) => (
                      <li key={index} className="whitespace-nowrap">
                        {symbol && <span className="mr-1.5">{symbol}</span>}
                        <span className="text-mint">+{formatPercent(gap)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span className="text-mist">{data ? "None recorded" : "—"}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PremarketPage() {
  const [params, setParams] = useSearchParams();
  const through = params.get("day") || "";
  const session = params.get("session") === "whole-day" ? sessions[1] : sessions[0];
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const request = new AbortController();
    setArchive(null);
    setError("");
    analysisService.getMovers(through || undefined, request.signal)
      .then((data) => { if (!request.signal.aborted) setArchive(data); })
      .catch((failure) => { if (!request.signal.aborted) setError(failure.message); });
    return () => request.abort();
  }, [through]);

  function update(key, value) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  return (
    <section className="analysis-panel min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="analysis-tabs" aria-label="Trading session">
          {sessions.map((item) => (
            <button key={item.key} type="button" aria-pressed={session.key === item.key}
              onClick={() => update("session", item.key === "wholeDay" ? "whole-day" : "")}>{item.label}</button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <label className="analysis-field" htmlFor="movers-through">
            Through date (ET)
            <input id="movers-through" type="date" value={through} max={getMarketDayKey(new Date())}
              onChange={(event) => update("day", event.target.value)} />
          </label>
          {through && <button type="button" className="ui-button min-h-11 px-3" onClick={() => update("day", "")}>Latest</button>}
        </div>
      </div>
      <p className="text-sm text-mist">{session.description} All gains are measured from the prior close.</p>
      {error ? <p className="text-sm text-coral" role="alert">{error}</p> : !archive ? (
        <LoadingState label="Loading mover history…" />
      ) : !archive.rows.length ? (
        <p className="border-t border-[var(--line)] pt-4 text-sm text-mist" role="status">
          {through ? "No saved mover summaries on or before this date." : "No historical mover summaries have been imported."}
        </p>
      ) : (
        <>
          <DailyMovers rows={archive.rows} session={session} />
          {archive.nextThrough && <button type="button" className="ui-button min-h-11 px-3"
            onClick={() => update("day", archive.nextThrough)}>Older dates</button>}
        </>
      )}
    </section>
  );
}
