import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import intelligenceService from "../../services/intelligenceService";
import IntelligenceOverview from "./IntelligenceOverview";

export default function DashboardIntelligence({ from, to }) {
  const [data, setData] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    setUnavailable(false);
    intelligenceService.overview(from && to ? { from, to } : undefined).then((value) => { if (active) setData(value); })
      .catch(() => { if (active) { setUnavailable(true); setData(null); } });
    return () => { active = false; };
  }, [from, to]);

  if (data) return <IntelligenceOverview data={data} onDismiss={async (key) => {
    try {
      await intelligenceService.dismiss(key);
      setData((current) => ({ ...current, insights: current.insights.filter((item) => item.fingerprint !== key) }));
    } catch { setUnavailable(true); }
  }} />;
  return <div className="analysis-panel flex flex-wrap items-center justify-between gap-3">
    <p role="status" className="text-sm text-mist">{unavailable ? "Trading intelligence could not load." : "Loading trading intelligence…"}</p>
    <Link className="text-sm text-[var(--accent)]" to="/reports?view=intelligence">Open intelligence</Link>
  </div>;
}
