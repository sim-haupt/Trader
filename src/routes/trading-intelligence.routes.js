const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/auth.middleware");
const asyncHandler = require("../middleware/async-handler");
const validate = require("../middleware/validate.middleware");
const intelligence = require("../services/trading-intelligence.service");

const router = express.Router();
router.use(authenticate);
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const day = z.string().date();
const identifier = z.string().min(1).max(100);
const text = z.string().trim().min(1).max(120);
const range = z.object({
  from: day, to: day, setup: text.optional(), symbol: z.string().trim().min(1).max(20).optional(), tag: text.optional(),
  side: z.enum(["LONG", "SHORT"]).optional(), session: z.enum(["Premarket", "Regular", "After hours", "Overnight"]).optional(),
  market: z.enum(["Hot", "Normal", "Cold", "Up", "Down", "Flat", "Elevated volatility", "Low volatility", "Typical volatility"]).optional(),
  result: z.enum(["win", "loss"]).optional(), confidence: z.enum(["high", "low"]).optional(),
  compliance: z.enum(["followed", "violated"]).optional()
});
const cadence = z.enum(["daily", "weekly", "monthly"]);
const category = z.enum(["performance", "setup", "time", "market", "execution", "costs", "risk", "behavior", "simulation"]);
const widget = z.enum(["performance", "insights", "context", "simulation"]);
const reportKind = z.enum(["daily", "weekly", "monthly", "strategy", "risk", "behavior", "execution", "trend"]);
const metric = z.enum(["outsideWindow", "riskCompliance", "commissionDrag", "executionSpread", "executionConsistency", "impulsive", "discipline", "customRule", "netExpectancy"]);
const unique = (item, max) => z.array(item).max(max).transform((array) => [...new Set(array)]);
const profile = z.object({
  categories: unique(category, 9), widgets: unique(widget, 4), cadences: unique(cadence, 3),
  hour: z.number().int().min(0).max(23), scheduledAI: z.boolean()
});

function respond(handler) {
  return asyncHandler(async (req, res) => {
    const data = await handler(req);
    res.json({ success: true, data });
  });
}

router.get("/profile", respond(({ user }) => intelligence.profile(user)));
router.put("/profile", validate(profile), respond(({ user, validatedBody }) => intelligence.saveProfile(user, validatedBody)));
router.post("/overview", validate(z.object({ range: range.optional() })),
  respond(({ user, validatedBody }) => intelligence.overview(user, validatedBody.range)));
router.post("/dismiss", validate(z.object({ fingerprint: z.string().regex(/^[a-f0-9]{32}$/) })),
  respond(async ({ user, validatedBody }) => { await intelligence.dismiss(user, validatedBody.fingerprint); return null; }));
router.post("/coach", validate(z.object({
  question: z.string().trim().min(4).max(1200), range: range.optional(),
  tradeCap: z.number().int().min(1).max(1000).optional(), useAI: z.boolean().default(false)
})), respond(({ user, validatedBody }) => intelligence.ask(user, validatedBody)));
router.post("/compare", validate(z.object({ a: range, b: range })),
  respond(({ user, validatedBody }) => intelligence.compare(user, validatedBody.a, validatedBody.b)));

router.get("/reports", respond(({ user }) => intelligence.listReports(user)));
router.post("/reports", validate(z.object({ kind: reportKind, range: range.optional(), useAI: z.boolean().default(false) })),
  respond(({ user, validatedBody }) => intelligence.generateReport(user, validatedBody)));
router.get("/reports/:id", validate(z.object({ id: identifier }), "params"),
  respond(({ user, validatedParams }) => intelligence.getReport(user, validatedParams.id)));
router.get("/reports/:id/export/:format", validate(z.object({ id: identifier, format: z.enum(["csv", "xlsx", "pdf"]) }), "params"),
  asyncHandler(async ({ user, validatedParams }, res) => {
    const result = await intelligence.exportReport(user, validatedParams.id, validatedParams.format);
    res.set("Cache-Control", "private, no-store");
    res.attachment(result.name).type(result.type).send(result.bytes);
  }));

const goalSchema = z.object({
  title: text, metric, direction: z.enum(["atLeast", "atMost"]), target: z.number().finite().min(-1e9).max(1e9),
  startsOn: day,
  settings: z.object({
    lookback: z.number().int().min(1).max(366), setup: text.optional(),
    startMinute: z.number().int().min(0).max(1439).optional(), endMinute: z.number().int().min(1).max(1440).optional(),
    ruleId: identifier.optional()
  })
}).superRefine((goal, ctx) => {
  const { settings } = goal;
  if (goal.metric === "outsideWindow" && !(settings.startMinute < settings.endMinute)) {
    ctx.addIssue({ code: "custom", path: ["settings"], message: "The target window needs an earlier start and later end." });
  }
  if (goal.metric === "customRule" && !settings.ruleId) {
    ctx.addIssue({ code: "custom", path: ["settings", "ruleId"], message: "Choose a trading rule." });
  }
  if (["outsideWindow", "riskCompliance", "impulsive", "discipline", "customRule"].includes(goal.metric) &&
      (goal.target < 0 || goal.target > 100) || ["executionSpread", "executionConsistency", "commissionDrag"].includes(goal.metric) && goal.target < 0) {
    ctx.addIssue({ code: "custom", path: ["target"], message: "The target is outside this metric’s range." });
  }
});

router.get("/goals", respond(({ user }) => intelligence.goals(user)));
router.post("/goals", validate(goalSchema), respond(({ user, validatedBody }) => intelligence.createGoal(user, validatedBody)));
router.post("/goals/:id/:action", validate(z.object({ id: identifier, action: z.enum(["sample", "archive"]) }), "params"),
  respond(({ user, validatedParams }) => intelligence.goalAction(user, validatedParams.id, validatedParams.action)));

module.exports = router;
