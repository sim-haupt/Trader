import { useState } from "react";

export const STRATEGIES = {
  time: "Fixed time", target: "Profit target", stop: "Stop loss", trail: "Trailing stop",
  ema: "EMA 9 cross", partial: "Partial profit-taking", breakEven: "Break-even after a gain"
};

export default function ScalpStrategyForm({ onRun, busy, mode = "auto", button = "Simulate exit", children }) {
  const [settings, setSettings] = useState({ type: "time", holdSeconds: "60", threshold: "2", stop: "2", partial: "50", addedCost: "0" });
  function field(key, label, min, max, step) {
    return <label className="analysis-field" key={key}>{label}
      <input type="number" min={min} max={max} step={step} required value={settings[key]}
        onChange={(event) => setSettings({ ...settings, [key]: event.target.value })} />
    </label>;
  }

  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      onRun({ ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, key === "type" ? value : Number(value)])), mode });
    }}>
      {children}
      <label className="analysis-field">Exit rule
        <select value={settings.type} onChange={(event) => setSettings({ ...settings, type: event.target.value })}>
          {Object.entries(STRATEGIES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
      </label>
      {field("holdSeconds", "Max hold (s)", 1, 1800, 1)}
      {["target", "trail", "partial", "breakEven"].includes(settings.type) &&
        field("threshold", settings.type === "trail" ? "Trail (%)" : "Trigger gain (%)", 0.01, 1000, 0.01)}
      {["stop", "partial"].includes(settings.type) && field("stop", "Stop (%)", 0.01, 1000, 0.01)}
      {settings.type === "partial" && field("partial", "Close (%)", 1, 99, 1)}
      {field("addedCost", "Extra fee / fill ($)", 0, 1000, 0.01)}
      <button type="submit" className="ui-button min-h-11 px-4" disabled={busy}>{busy ? "Working…" : button}</button>
    </form>
  );
}
