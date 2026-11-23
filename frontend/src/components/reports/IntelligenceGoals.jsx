import { useEffect, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import analysisService from "../../services/analysisService";
import intelligenceService from "../../services/intelligenceService";
import { goalLabels, metric } from "./IntelligenceOverview";

function toMinute(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export default function IntelligenceGoals({ seed, today, setup }) {
  const [rows, setRows] = useState([]);
  const [rules, setRules] = useState([]);
  const [kind, setKind] = useState(seed?.goalMetric || "discipline");
  const [title, setTitle] = useState(seed?.title ? `Follow up · ${seed.title}`.slice(0, 120) : "");
  const [direction, setDirection] = useState(goalLabels[seed?.goalMetric || "discipline"][2]);
  const [target, setTarget] = useState("");
  const [startsOn, setStartsOn] = useState(today);
  const [lookback, setLookback] = useState(30);
  const [strategy, setStrategy] = useState(setup || "");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:30");
  const [ruleId, setRuleId] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([intelligenceService.listGoals(), analysisService.getRiskProfile()]).then(([goals, risk]) => {
      if (!active) return;
      setRows(goals);
      setRules(risk.rules);
    }).catch((error) => { if (active) setStatus(error.message); });
    return () => { active = false; };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy("new");
    setStatus("");
    try {
      const goal = await intelligenceService.createGoal({
        title, metric: kind, direction, target: Number(target), startsOn,
        settings: { lookback: Number(lookback), setup: strategy.trim() || undefined,
          ...(kind === "outsideWindow" ? { startMinute: toMinute(start), endMinute: toMinute(end) } : {}),
          ...(kind === "customRule" ? { ruleId } : {}) }
      });
      setRows((current) => [goal, ...current]);
      setTitle("");
      setTarget("");
      setStatus("Goal saved.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(""); }
  }

  async function run(id, action) {
    setBusy(id);
    setStatus("");
    try {
      const result = await intelligenceService.goalAction(id, action);
      if (action === "archive") {
        setRows((current) => current.map((row) => row.id === id ? { ...row, archivedAt: result.archivedAt } : row));
        setStatus("Goal archived.");
      } else if (result) {
        setRows((current) => current.map((row) => row.id === id ? {
          ...row, observations: [result, ...row.observations.filter((item) => item.dayKey !== result.dayKey)]
        } : row));
        setStatus("Progress recorded.");
      } else setStatus("There is no measurable coverage in the current goal window.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(""); }
  }

  return (
    <section className="analysis-panel space-y-4">
      <h2 className="text-lg font-semibold">Improvement goals</h2>
      <p className="text-sm text-mist">Track changes in a defined sample. Reaching a target measures progress on that metric; it does not establish what caused a trading result.</p>
      <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" onSubmit={save}>
        <label className="analysis-field">Goal title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="analysis-field">Metric<select value={kind} onChange={(event) => {
          setKind(event.target.value); setDirection(goalLabels[event.target.value][2]); setTarget("");
        }}>{Object.entries(goalLabels).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="analysis-field">Direction<select value={direction} onChange={(event) => setDirection(event.target.value)}>
          <option value="atLeast">At least</option><option value="atMost">At most</option>
        </select></label>
        <label className="analysis-field">Target value ({goalLabels[kind][1]})
          <input type="number" step="any" required value={target} onChange={(event) => setTarget(event.target.value)} />
        </label>
        <label className="analysis-field">Start date (ET)<input type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
        <label className="analysis-field">Lookback days<input type="number" min={1} max={366} required value={lookback} onChange={(event) => setLookback(event.target.value)} /></label>
        <label className="analysis-field">Setup (optional)<input value={strategy} maxLength={120} onChange={(event) => setStrategy(event.target.value)} /></label>
        {kind === "outsideWindow" && <>
          <label className="analysis-field">Window start (ET)<input type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="analysis-field">Window end (ET)<input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </>}
        {kind === "customRule" && <label className="analysis-field">Trading rule
          <select required value={ruleId} onChange={(event) => setRuleId(event.target.value)}>
            <option value="">Choose a rule</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
          </select>
        </label>}
        <div className="sm:col-span-2 xl:col-span-3"><button type="submit" className="ui-button-solid min-h-11 px-4" disabled={Boolean(busy)}>Create goal</button></div>
      </form>
      {status && <p role="status" className="text-sm">{status}</p>}
      <div className="space-y-3">
        {rows.map((goal) => {
          const [label, unit] = goalLabels[goal.metric];
          const latest = goal.observations[0];
          const met = latest && (goal.direction === "atLeast" ? latest.value >= goal.target : latest.value <= goal.target);
          const timeline = [...goal.observations].reverse();
          return <article key={goal.id} className="rounded-md border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold">{goal.title}</h3>
                <p className="text-sm text-mist">{label} · {goal.direction === "atLeast" ? "At least" : "At most"} {metric(goal.target, unit)}
                  {goal.settings.setup && ` · ${goal.settings.setup}`}</p></div>
              <span className="text-sm">{goal.archivedAt ? "Archived" : met ? "Target met" : latest ? "In progress" : "Awaiting evidence"}</span>
            </div>
            {latest && <p className="mt-2 text-sm">Latest {metric(latest.value, unit)} · n={latest.sampleCount} · {latest.dayKey} ET</p>}
            {!goal.archivedAt && <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="ui-button min-h-11 px-3 text-sm" disabled={Boolean(busy)} onClick={() => run(goal.id, "sample")}>Record progress</button>
              <button type="button" className="ui-button min-h-11 px-3 text-sm" disabled={Boolean(busy)} onClick={() => run(goal.id, "archive")}>Archive goal</button>
            </div>}
            {timeline.length > 0 && <details className="mt-3 text-sm">
              <summary className="cursor-pointer">Progress history</summary>
              {timeline.length > 1 && <div className="mt-3 h-44">
                <ResponsiveContainer>
                  <LineChart data={timeline}>
                    <XAxis dataKey="dayKey" tickFormatter={(value) => value.slice(5)} minTickGap={20} tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#a3a3a3", fontSize: 11 }} />
                    <Tooltip formatter={(value) => metric(value, unit)} contentStyle={{ background: "#131313", border: "1px solid #333" }} />
                    <ReferenceLine y={goal.target} stroke="#a3a3a3" strokeDasharray="4 3" />
                    <Line dataKey="value" stroke="#63b3ff" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>}
              <ul className="mt-3 max-h-52 space-y-1 overflow-auto text-mist">{goal.observations.map((item) =>
                <li key={item.dayKey}>{item.dayKey} ET · {metric(item.value, unit)} · n={item.sampleCount}</li>)}</ul>
            </details>}
          </article>;
        })}
      </div>
    </section>
  );
}
