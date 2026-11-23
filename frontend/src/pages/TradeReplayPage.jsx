import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TradeReplayChart } from "../components/TradeReviewCharts";
import analysisService from "../services/analysisService";
import tradeReviewService from "../services/tradeReviewService";
import { formatCurrency } from "../utils/formatters";
import { useAuth } from "../context/AuthContext";

const formatTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit",
  minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
const timeLabel = (value) => `${formatTime.format(new Date(value))} ET`;

function ReplayWorkspace({ id }) {
  const [step, setStep] = useState(10);
  const [frame, setFrame] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [notes, setNotes] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const screenshotRef = useRef(null);
  const limit = frame?.maxSteps;
  const pending = !frame || (limit >= 1 && frame.step !== step);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    analysisService.getReplay(id, step, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setFrame(next);
      setNotes((previous) => previous ?? next.notes ?? "");
      if (next.step !== step && next.step >= 1) setStep(next.step);
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setError(failure.message);
      setPlaying(false);
    });
    return () => controller.abort();
  }, [id, step, retry]);

  useEffect(() => {
    if (!playing || pending || !limit || step >= limit || error) return undefined;
    const timer = setTimeout(() => setStep((current) => current + 1), 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, pending, limit, step, speed, error]);

  function seek(value) {
    setPlaying(false);
    setStep(Math.max(1, Math.min(limit || 1, value)));
  }

  async function save(addSnapshot) {
    setSaving(true);
    setStatus("");
    try {
      if (addSnapshot) {
        const canvas = screenshotRef.current?.();
        if (!canvas) throw new Error("Load a candle before saving a screenshot.");
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Chart image unavailable.");
        await tradeReviewService.uploadImages({
          files: [new File([blob], `${frame.symbol}-replay-${frame.step}.png`, { type: "image/png" })],
          tags: ["Replay"], notes: `${frame.symbol} · Trade ${id} · ${timeLabel(frame.cutoff)}\n${notes || ""}`
        });
        setStatus("Screenshot saved to the Reviews gallery.");
      } else {
        await analysisService.saveReplayNotes(id, notes || "");
        setStatus("Replay notes saved.");
      }
    } catch (failure) {
      setStatus(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="analysis-panel space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">{frame?.symbol ?? "Historical replay"}</h2>
            {frame && <p className="text-sm text-mist" aria-live={playing ? "off" : "polite"}>{timeLabel(frame.cutoff)}</p>}</div>
          <Link className="text-sm text-[var(--accent)]" to={`/trades/${id}`}>Back to trade detail</Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ui-button px-3 min-h-11" disabled={!limit || step <= 1} onClick={() => seek(1)}>Restart</button>
          <button type="button" className="ui-button px-3 min-h-11" disabled={!limit || step <= 1} onClick={() => seek(step - 1)}>−1 candle</button>
          <button type="button" className="ui-button-solid px-3 min-h-11" disabled={!limit || step >= limit || Boolean(error)}
            onClick={() => setPlaying((value) => !value)}>{playing && step < limit ? "Pause" : "Play"}</button>
          <button type="button" className="ui-button px-3 min-h-11" disabled={!limit || step >= limit} onClick={() => seek(step + 1)}>+1 candle</button>
          <button type="button" className="ui-button px-3 min-h-11" disabled={!limit || step >= limit} onClick={() => seek(step + 15)}>+15 min</button>
          <label className="analysis-field">Speed<select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            {[0.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value}×</option>)}
          </select></label>
        </div>
        {limit >= 1 && <label className="analysis-field">Replay minute {step} of {limit}
          <input type="range" min={1} max={limit} value={step} onChange={(event) => seek(Number(event.target.value))} />
        </label>}
        {pending && !error && <p className="text-sm text-mist">Loading replay frame…</p>}
        {error && <div role="alert" className="text-sm text-coral">{error} <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
      </div>
      {frame && <TradeReplayChart frame={frame} screenshotRef={screenshotRef} />}
      {frame && (
        <section className="analysis-panel space-y-4">
          <h2 className="text-lg font-semibold">Visible fills and excursions</h2>
          <p className="text-sm text-mist">MFE {frame.excursion.mfe == null ? "–" : formatCurrency(frame.excursion.mfe)} · MAE {frame.excursion.mae == null ? "–" : formatCurrency(frame.excursion.mae)} · gross, completed in-position bars</p>
          {frame.executions.length ? <ul className="space-y-2 text-sm">
            {frame.executions.map((fill) => <li key={fill.id}>{timeLabel(fill.occurredAt)} · {fill.action} {fill.quantity ?? ""} @ {formatCurrency(Number(fill.price))}
              {fill.source === "SYNTHETIC" ? " · Reported" : ""}</li>)}
          </ul> : <p className="text-sm text-mist">No fills have occurred in the visible replay.</p>}
          <label className="analysis-field">Replay notes
            <textarea rows={3} maxLength={4000} value={notes ?? ""} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ui-button min-h-11 px-3" onClick={() => save(false)} disabled={saving}>Save replay notes</button>
            <button type="button" className="ui-button min-h-11 px-3" onClick={() => save(true)} disabled={saving || pending || playing || !frame.bars.length}>Save screenshot</button>
          </div>
          {status && <p role="status" className="text-sm text-mist">{status}</p>}
        </section>
      )}
    </div>
  );
}

export default function TradeReplayPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return <ReplayWorkspace key={`${id}:${user?.id}:${user?.activeAccountScope}`} id={id} />;
}
