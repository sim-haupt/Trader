const { createHash, randomUUID } = require("node:crypto");
const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const { buildTradeWhere } = require("./trade.service");
const { getProfile: getRiskProfile } = require("./risk-workspace.service");
const { getSnapshotSummary } = require("./premarket.service");
const { marketDayKey, shiftDay } = require("../utils/marketSession");
const periods = require("../utils/intelligencePeriods");
const coach = require("./intelligence-coach.service");
const { buildCsv, buildSimplePdf, safeCell } = require("../utils/reportExport");

const modulePromise = import("../utils/intelligenceEvidence.mjs");
const MAX_TRADES = 20000;
const PROFILE = { categories: null, widgets: null, cadences: [], hour: 8, scheduledAI: false };

const scopeFor = (actor) => ({ userId: actor.id, accountScope: actor.activeAccountScope || "SIMULATOR" });
const profileWhere = (actor) => ({ userId_accountScope: scopeFor(actor) });
const reportWhere = (actor, reportKey) => ({ userId_accountScope_reportKey: { ...scopeFor(actor), reportKey } });

async function profile(actor) {
  const row = await prisma.intelligenceProfile.findUnique({ where: profileWhere(actor) });
  const { CATEGORIES, WIDGETS } = await modulePromise;
  const settings = { ...PROFILE, ...(row?.settings || {}) };
  return { ...settings, categories: settings.categories ?? CATEGORIES, widgets: settings.widgets ?? WIDGETS,
    nextRunAt: row?.nextRunAt ?? null, aiAvailable: coach.providerAvailable() };
}

async function saveProfile(actor, settings, now = new Date()) {
  const scope = scopeFor(actor);
  const nextRunAt = settings.cadences.length ? periods.nextSchedule(now, settings.hour) : null;
  await prisma.intelligenceProfile.upsert({
    where: profileWhere(actor), create: { ...scope, settings, nextRunAt },
    update: { settings, nextRunAt, leaseUntil: null }
  });
  return profile(actor);
}

async function loadTrades(actor, range) {
  const rows = await prisma.trade.findMany({
    where: buildTradeWhere(actor, { from: range.from, to: range.to }),
    orderBy: [{ entryDate: "asc" }, { id: "asc" }], take: MAX_TRADES + 1,
    select: {
      id: true, symbol: true, side: true, strategy: true, tags: true, quantity: true, entryPrice: true, exitPrice: true,
      entryDate: true, exitDate: true, commissions: true, fees: true, grossPnl: true, netPnl: true,
      instrumentFloat: true, entryPriorCloseDiffPercent: true, entryRelativeVolume: true,
      executions: { orderBy: { sequence: "asc" }, take: 1, select: { source: true, occurredAt: true, price: true, quantity: true, action: true } },
      analysis: { select: { behavior: true, snapshot: true, execution: true } },
      entryReview: { select: { plannedInitialRisk: true, plannedStop: true, intendedPrice: true, outcome: true } }
    }
  });
  if (rows.length > MAX_TRADES) throw new ApiError(422, "This range has more than 20,000 trades. Choose a shorter period.");
  return rows;
}

function validateRange(range, name = "Date range") {
  const span = periods.daySpan(range.from, range.to);
  if (!Number.isFinite(span) || span < 1 || span > 366) throw new ApiError(400, `${name} must be between 1 and 366 calendar days.`);
}

async function defaultRange(actor, now) {
  const latest = await prisma.trade.findFirst({
    where: buildTradeWhere(actor), orderBy: { entryDate: "desc" }, select: { entryDate: true }
  });
  const today = marketDayKey(now);
  const to = latest ? [marketDayKey(latest.entryDate), today].sort()[0] : today;
  return { from: shiftDay(to, -29), to };
}

function evidenceFilter(range) {
  return Object.fromEntries(Object.entries(range).filter(([key, value]) =>
    ["setup", "symbol", "session", "market", "result", "confidence", "compliance", "tag", "side"].includes(key) && value));
}

async function loadPremarket(actor, ranges) {
  const result = await Promise.all(ranges.map(({ from, to }) => getSnapshotSummary(actor.id, { from, to }, "entries")));
  const unique = new Map(result.flat().map((row) => [`${row.dayKey}:${row.cutoff.toISOString()}`, row]));
  return [...unique.values()].sort((a, b) => a.cutoff - b.cutoff);
}

async function getEvidence(actor, request = {}, now = new Date()) {
  const range = request.range || await defaultRange(actor, now);
  validateRange(range);
  const compare = request.comparison || periods.comparisonPeriod(range, request.kind);
  validateRange(compare, "Comparison period");
  const [[trades, previousTrades], risk, premarket, { buildEvidence }] = await Promise.all([
    Promise.all([loadTrades(actor, range), loadTrades(actor, compare)]),
    getRiskProfile(actor), loadPremarket(actor, [range, compare]), modulePromise
  ]);
  const data = buildEvidence({ trades, previousTrades, ranges: {
    current: { from: range.from, to: range.to }, previous: compare
  }, premarket, profile: risk, filter: evidenceFilter(range), requestedCap: request.tradeCap });
  return { ...data, filter: evidenceFilter(range) };
}

function fingerprint(row, range) {
  return createHash("sha256").update(JSON.stringify([row.category, row.id, row.direction,
    row.score >= 60 ? "large" : "moderate", range.to.slice(0, 7)])).digest("hex").slice(0, 32);
}

async function overview(actor, range, now = new Date()) {
  const [data, settings] = await Promise.all([getEvidence(actor, { range }, now), profile(actor)]);
  const insights = data.insights.filter((item) => settings.categories.includes(item.category)).map((item) => ({
    ...item, fingerprint: fingerprint(item, data.ranges.current)
  }));
  const dismissed = insights.length ? await prisma.intelligenceDismissal.findMany({
    where: { ...scopeFor(actor), fingerprint: { in: insights.map((row) => row.fingerprint) } }, select: { fingerprint: true }
  }) : [];
  const hidden = new Set(dismissed.map((row) => row.fingerprint));
  const latestAI = settings.widgets.includes("insights") ? await prisma.intelligenceReport.findFirst({
    where: { ...scopeFor(actor), payload: { path: ["source"], equals: "ai" } },
    orderBy: { createdAt: "desc" }, select: { fromDay: true, toDay: true, payload: true }
  }) : null;
  const aiReview = latestAI?.payload?.focus?.[0] ?
    { from: latestAI.fromDay, to: latestAI.toDay, evidence: latestAI.payload.focus[0] } : null;
  return { ...data, insights: insights.filter((row) => !hidden.has(row.fingerprint)).slice(0, 8), aiReview, settings };
}

async function dismiss(actor, fingerprint) {
  const key = { ...scopeFor(actor), fingerprint };
  await prisma.intelligenceDismissal.upsert({ where: { userId_accountScope_fingerprint: key }, create: key, update: {} });
}

function questionPeriod(question, range, now) {
  const today = marketDayKey(now);
  const base = { ...range };
  const start = `${today.slice(0, 7)}-01`;
  if (/\b(?:this|current) month\b/i.test(question)) return { range: { ...base, from: start, to: today }, kind: "monthly" };
  if (/\b(?:last|previous) month\b/i.test(question)) {
    const to = shiftDay(start, -1);
    return { range: { ...base, from: `${to.slice(0, 7)}-01`, to }, kind: "monthly" };
  }
  return { range };
}

async function ask(actor, { question, range, tradeCap, useAI }, now = new Date()) {
  const scope = questionPeriod(question, range, now);
  const spelled = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const inferred = question.match(/(?:limit(?: myself)? to|cap(?: at)?|max(?:imum)?|only|fewer than|at most)\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:entries|trades)\b/i);
  const cap = tradeCap ?? (inferred ? spelled[inferred[1].toLowerCase()] || Number(inferred[1]) : null);
  const [data, analytics] = await Promise.all([
    getEvidence(actor, { ...scope, tradeCap: cap > 0 ? cap : undefined }, now), modulePromise
  ]);
  if (/previous months|last (?:few|several) months|monthly trend/i.test(question)) {
    const trend = await reportTrends(actor, data.ranges.current, data.filter, analytics);
    const covered = trend.filter((row) => row.count);
    if (covered.length) data.evidence.push({ id: "multi-month", category: "performance",
      title: "Recent monthly net P&L", facts: covered.map((row) => ({
        label: row.label, value: row.net, unit: "$", n: row.count
      })), type: "historical", assessment: "Closed results grouped by entry month. The latest month can be partial.",
      support: covered.length, score: 45, trades: [], action: "sample", direction: "", goalMetric: "netExpectancy" });
  }
  const result = await coach.selectEvidence({ actor, question, consent: useAI, evidence: data.evidence, now });
  const cards = new Map(data.evidence.map((row) => [row.id, row]));
  return {
    source: result.source, notice: result.notice ?? (!data.simulation && /what if|what would|reduc.*frequen|fewer trades/i.test(question)
      ? "Enter a daily cap to run a hypothetical comparison on dated closed trades." : null), ranges: data.ranges, filter: data.filter,
    evidence: result.ids.map((id) => cards.get(id)), actions: result.actions.map((key) => analytics.ACTIONS[key]),
    simulation: result.ids.includes("simulation") ? data.simulation : null
  };
}

async function compare(actor, a, b) {
  validateRange(a, "Cohort A");
  validateRange(b, "Cohort B");
  const [{ compareCohorts }, aTrades, bTrades, premarket] = await Promise.all([
    modulePromise, loadTrades(actor, a), loadTrades(actor, b),
    loadPremarket(actor, [a, b])
  ]);
  return { ...compareCohorts({ trades: aTrades, filter: a }, { trades: bTrades, filter: b }, premarket),
    ranges: { a: { from: a.from, to: a.to }, b: { from: b.from, to: b.to } } };
}

const kindCategories = { strategy: ["setup", "performance"], risk: ["risk", "performance"],
  behavior: ["behavior", "risk"], execution: ["execution", "costs"], trend: ["performance", "time"] };

async function reportTrends(actor, range, filter, analytics) {
  const buckets = [];
  for (let offset = 0, cursor = range.to; offset < 6; offset += 1) {
    const from = `${cursor.slice(0, 7)}-01`;
    buckets.unshift({ from, to: cursor });
    cursor = shiftDay(from, -1);
  }
  const span = { from: buckets[0].from, to: range.to };
  const [rows, premarket] = await Promise.all([loadTrades(actor, span), filter.market ? loadPremarket(actor, [span]) : []]);
  return analytics.monthlyTrend(rows, buckets, filter, premarket);
}

async function generateReport(actor, request, { now = new Date(), scheduled = false } = {}) {
  const range = request.range || await defaultRange(actor, now);
  const selected = { ...range, ...periods.reportRange(request.kind, range) };
  if (request.kind === "strategy" && !selected.setup) throw new ApiError(400, "Choose a setup for a strategy-specific report.");
  const scope = scopeFor(actor);
  // A scheduled report has one canonical edition for each completed period.
  const reportKey = scheduled ? `${request.kind}:${selected.from}:${selected.to}` : `manual:${randomUUID()}`;
  if (scheduled) {
    const existing = await prisma.intelligenceReport.findUnique({ where: reportWhere(actor, reportKey) });
    if (existing) return existing;
  }
  const [data, analytics] = await Promise.all([getEvidence(actor, { range: selected, kind: request.kind }, now), modulePromise]);
  if (scheduled && !data.summary.count) return null;
  const priorities = kindCategories[request.kind] || ["performance", "setup", "time", "risk", "behavior", "execution", "costs", "market"];
  const relevant = data.evidence.filter((card) => priorities.includes(card.category));
  const review = await coach.selectEvidence({
    actor, question: `Prioritize the most useful evidence and investigation steps for this ${request.kind} trading review.`,
    evidence: relevant, consent: request.useAI, now
  });
  const focus = review.ids.map((id) => relevant.find((card) => card.id === id)).filter(Boolean);
  const trends = ["monthly", "trend"].includes(request.kind) ? await reportTrends(actor, selected, evidenceFilter(selected), analytics) : [];
  const payload = { ...data, focus, trends, source: review.source, recommendations: review.actions.map((key) => analytics.ACTIONS[key]),
    notice: review.notice ?? null, scheduled };
  return prisma.intelligenceReport.upsert({ where: reportWhere(actor, reportKey), update: {}, create: {
    ...scope, reportKey, kind: request.kind, fromDay: selected.from, toDay: selected.to, payload
  } });
}

function listReports(actor) {
  return prisma.intelligenceReport.findMany({ where: scopeFor(actor), orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 40, select: { id: true, kind: true, fromDay: true, toDay: true, createdAt: true } });
}

async function getReport(actor, id) {
  const report = await prisma.intelligenceReport.findFirst({ where: { id, ...scopeFor(actor) } });
  if (!report) throw new ApiError(404, "Report not found.");
  return report;
}

async function exportReport(actor, id, format) {
  const report = await getReport(actor, id);
  const { formatMetric } = await modulePromise;
  const snapshot = report.payload;
  const base = `trading-${report.kind}-${report.fromDay}-${report.toDay}`;
  const header = ["Type", "Evidence", "Metric", "Value", "Unit", "Observations", "Assessment"];
  const rows = snapshot.evidence.flatMap((card) => card.facts.map((fact) => [
    card.type, card.title, fact.label, fact.value, fact.unit, fact.n ?? "", card.assessment
  ]));
  if (format === "csv") return { name: `${base}.csv`, type: "text/csv", bytes: buildCsv(rows,
    header.map((label, index) => ({ label, value: (row) => row[index] })), { allowNumbers: true }) };
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    const add = (name, values) => XLSX.utils.book_append_sheet(workbook,
      XLSX.utils.aoa_to_sheet(values.map((row) => row.map((cell) => typeof cell === "string" ? safeCell(cell) : cell))), name);
    add("Summary", [["Report", report.kind], ["From (ET)", report.fromDay], ["To (ET)", report.toDay],
      ["Comparison from", snapshot.ranges.previous.from], ["Comparison to", snapshot.ranges.previous.to],
      ["Interpretation", snapshot.source], ...snapshot.recommendations.map((text) => ["Review next", text])]);
    add("Evidence", [header, ...rows]);
    add("Trade references", [["Evidence", "Trade ID", "Ticker", "Trading date"], ...snapshot.evidence.flatMap((card) =>
      card.trades.map((trade) => [card.title, trade.id, trade.symbol, trade.day]))]);
    if (snapshot.trends.length) add("Monthly trends", [["Month", "Closed trades", "Net P&L", "Expectancy", "Win rate (%)"],
      ...snapshot.trends.map((row) => [row.label, row.count, row.net, row.expectancy, row.winRate])]);
    return { name: `${base}.xlsx`, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) };
  }
  const lines = [
    `Trading ${report.kind} review`, `${report.fromDay} through ${report.toDay} ET`,
    `Comparison ${snapshot.ranges.previous.from} through ${snapshot.ranges.previous.to} ET`, "",
    ...snapshot.evidence.flatMap((card) => [`[${card.type}] ${card.title}`, card.assessment,
      ...card.facts.map((fact) => `  ${fact.label}: ${formatMetric(fact.value, fact.unit)}${fact.n == null ? "" : ` (n=${fact.n})`}`), ""]),
    "Review next", ...snapshot.recommendations, "", ...snapshot.trends.map((row) =>
      `${row.label}: ${formatMetric(row.net, "$")} net, ${row.count} trades`)
  ].flatMap((line) => (line.normalize("NFKD").replace(/[^\x20-\x7E]/g, "-").match(/.{1,100}/g) || [""]));
  return { name: `${base}.pdf`, type: "application/pdf", bytes: buildSimplePdf(lines, "Page") };
}

async function goals(actor) {
  const rows = await prisma.intelligenceGoal.findMany({
    where: scopeFor(actor), take: 75, orderBy: [{ archivedAt: "desc" }, { createdAt: "desc" }],
    include: { observations: { orderBy: { dayKey: "desc" }, take: 52 } }
  });
  return rows.sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)));
}

async function goalReading(actor, goal, now) {
  const dayKey = marketDayKey(now);
  if (goal.startsOn > dayKey) return null;
  const from = [goal.startsOn, shiftDay(dayKey, -(goal.settings.lookback - 1))].sort().at(-1);
  const [trades, { goalValue }] = await Promise.all([loadTrades(actor, { from, to: dayKey }), modulePromise]);
  const setup = goal.settings.setup?.toLowerCase();
  const cohort = setup ? trades.filter((row) => row.strategy?.toLowerCase() === setup) : trades;
  const result = goalValue(cohort, goal.settings, goal.metric, goal.settings.limits);
  if (result.value == null) return null;
  const data = { value: result.value, sampleCount: result.n };
  return prisma.intelligenceGoalObservation.upsert({
    where: { goalId_dayKey: { goalId: goal.id, dayKey } },
    create: { goalId: goal.id, dayKey, ...data }, update: data
  });
}

async function createGoal(actor, data, now = new Date()) {
  const risk = await getRiskProfile(actor);
  const { title, metric, direction, target, settings, startsOn } = data;
  if (metric === "riskCompliance" && !["tradeRisk", "dailyExposure", "weeklyExposure"].some((field) => risk.limits[field] > 0)) {
    throw new ApiError(400, "Save a per-trade, daily, or weekly risk exposure limit first.");
  }
  if (metric === "customRule" && !risk.rules.some((rule) => rule.id === settings.ruleId)) {
    throw new ApiError(400, "Choose an existing trading rule from the risk profile.");
  }
  const scope = scopeFor(actor);
  if (await prisma.intelligenceGoal.count({ where: { ...scope, archivedAt: null } }) >= 20) {
    throw new ApiError(422, "Archive an existing goal before adding another.");
  }
  const goal = await prisma.intelligenceGoal.create({
    data: { ...scope, title, metric, direction, target, startsOn, settings: { ...settings,
      ...(metric === "riskCompliance" ? { limits: Object.fromEntries(["tradeRisk", "dailyExposure", "weeklyExposure"].map((field) => [field, risk.limits[field] ?? null])) } : {}) } }
  });
  return { ...goal, observations: [] };
}

async function goalAction(actor, id, action, now = new Date()) {
  const goal = await prisma.intelligenceGoal.findFirst({ where: { id, ...scopeFor(actor) } });
  if (!goal) throw new ApiError(404, "Goal not found.");
  if (action === "archive") return prisma.intelligenceGoal.update({ where: { id }, data: { archivedAt: goal.archivedAt || now } });
  if (goal.archivedAt) throw new ApiError(409, "This goal is archived.");
  return goalReading(actor, goal, now);
}

async function runDue(now = new Date()) {
  const due = await prisma.intelligenceProfile.findMany({
    where: { nextRunAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    take: 12, orderBy: { nextRunAt: "asc" },
    include: { user: { select: { id: true, liveDataStartDate: true } } }
  });
  for (const row of due) {
    const actor = { ...row.user, activeAccountScope: row.accountScope };
    const scope = scopeFor(actor);
    const leaseUntil = new Date(now.getTime() + 10 * 60_000);
    const lock = await prisma.intelligenceProfile.updateMany({
      where: { ...scope, nextRunAt: row.nextRunAt, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: { leaseUntil }
    });
    if (lock.count !== 1) continue;
    try {
      const pending = periods.pendingPeriods(now, row.nextRunAt, row.settings.hour, row.settings.cadences);
      const latest = new Map(pending.map((period) => [period.kind, period.to]));
      let cancelled = false;
      for (const { kind, from, to } of pending) {
        const locked = await prisma.intelligenceProfile.findFirst({ where: { ...scope, leaseUntil },
          select: { settings: true } });
        if (!locked) { cancelled = true; break; }
        await generateReport(actor, { kind, range: { from, to },
          useAI: locked.settings.scheduledAI && latest.get(kind) === to }, { now, scheduled: true });
      }
      if (cancelled) continue;
      const active = await prisma.intelligenceGoal.findMany({ where: { ...scope, archivedAt: null }, take: 20 });
      for (const goal of active) await goalReading(actor, goal, now);
      await prisma.intelligenceProfile.updateMany({ where: { ...scope, leaseUntil },
        data: { leaseUntil: null, nextRunAt: periods.nextSchedule(now, row.settings.hour) } });
    } catch (error) {
      // Keep the due timestamp so an interrupted job can retry after the bounded lease.
      console.warn("Trading intelligence scheduled job failed", error.code || error.statusCode || error.name);
    }
  }
}

function startScheduler() {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try { await runDue(); } catch (error) { console.warn("Trading intelligence scheduler unavailable", error.code || error.name); }
    finally { running = false; }
  }
  void tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
}

module.exports = { profile, saveProfile, overview, dismiss, ask, compare, generateReport, listReports,
  getReport, exportReport, goals, createGoal, goalAction, runDue, startScheduler };
