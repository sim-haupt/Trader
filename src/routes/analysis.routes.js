const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/auth.middleware");
const asyncHandler = require("../middleware/async-handler");
const validate = require("../middleware/validate.middleware");
const reviews = require("../services/entry-review.service");
const intelligence = require("../services/trade-intelligence.service");
const risk = require("../services/risk-workspace.service");
const { getExitPerformanceBatch } = require("../services/exit-performance.service");
const { blindGradeSchema, amount } = require("../validators/entry-grade.schemas");

const router = express.Router();
router.use(authenticate);

const queueSchema = z.object({
  graded: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  entryDate: z.string().datetime().transform((value) => new Date(value)).optional(),
  id: z.string().min(1).max(100).optional()
}).refine(({ entryDate, id }) => Boolean(entryDate) === Boolean(id));
function respond(handler) {
  return asyncHandler(async (req, res) => {
    const data = await handler(req);
    res.json({ success: true, data });
  });
}

router.get("/entry-reviews", validate(queueSchema, "query"), respond(async ({ user, validatedQuery }) => {
  const { graded, entryDate, id } = validatedQuery;
  const rows = await reviews.listQueue(user, { graded, before: id ? { id, entryDate } : null });
  return { trades: rows.slice(0, 50), hasMore: rows.length > 50 };
}));
router.get("/entry-reviews/:id", respond(({ user, params }) => reviews.getBlindEntry(user, params.id)));
router.post("/entry-reviews/:id", validate(blindGradeSchema), respond(({ user, params, validatedBody }) =>
  reviews.saveGrade(user, params.id, validatedBody)
));
router.get("/entry-reviews/:id/outcome", respond(({ user, params }) => reviews.getOutcome(user, params.id)));
router.patch("/entry-reviews/:id/reflection", validate(z.object({ notes: z.string().trim().max(4000) })), respond(async ({
  user, params, validatedBody
}) => {
  await reviews.saveReflection(user, params.id, validatedBody.notes);
  return null;
}));

router.post("/trades/refresh", validate(z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(5) })),
  respond(({ user, validatedBody }) => intelligence.refreshBatch(user, validatedBody.ids)));
router.post("/trades/:id/refresh", respond(({ user, params }) => intelligence.refresh(user, params.id)));
router.put("/trades/:id/plan", validate(z.object({ intendedExit: amount, stopExecutionId: z.string().min(1).max(100).nullable() })),
  respond(({ user, params, validatedBody }) => intelligence.updatePlan(user, params.id, validatedBody)));

const positive = z.number().min(0.01).max(1_000_000_000).nullable().optional();
const shortText = z.string().trim().min(1).max(100);
const observation = z.enum(["followed", "violated", "unknown"]);
const behaviorSchema = z.object({
  before: z.string().trim().max(60), after: z.string().trim().max(60),
  confidence: z.number().int().min(1).max(5).nullable(),
  quality: z.number().int().min(1).max(5).nullable(),
  setup: observation, entry: observation, exit: observation,
  tags: z.array(shortText).max(30),
  rules: z.array(z.object({ id: z.string().max(80), label: shortText, result: observation })).max(100)
});
const riskSettings = z.object({
  limits: z.object({ dailyLoss: positive, dailyProfit: positive, dailyExposure: positive, weeklyExposure: positive,
    tradeRisk: positive, lossStreak: z.number().int().min(1).max(1000).nullable().optional() }),
  rules: z.array(z.object({ id: z.string().min(1).max(80), label: shortText })).max(30)
    .refine((rules) => new Set(rules.map(({ id }) => id)).size === rules.length),
  tags: z.array(shortText).max(30)
});
router.get("/risk-profile", respond(({ user }) => risk.getProfile(user)));
router.put("/risk-profile", validate(riskSettings), respond(({ user, validatedBody }) => risk.saveProfile(user, validatedBody)));
const savedSimulation = z.object({
  mode: z.enum(["rescale", "path", "assumed"]),
  source: z.enum(["actual", "scenario"]),
  whatIf: z.record(z.string().max(32)).refine((value) => Object.keys(value).length <= 20),
  monte: z.record(z.string().max(32)).refine((value) => Object.keys(value).length <= 12)
});
router.put("/risk-profile/simulation", validate(savedSimulation), respond(({ user, validatedBody }) =>
  risk.saveSimulation(user, validatedBody)));
router.put("/trades/:id/behavior", validate(behaviorSchema), respond(({ user, params, validatedBody }) =>
  risk.saveTradeRecord(user, params.id, { behavior: validatedBody })));
router.put("/trades/:id/original-risk", validate(z.object({ plannedStop: amount.optional(), plannedInitialRisk: amount.optional() })),
  respond(({ user, params, validatedBody }) => risk.completeOriginalRisk(user, params.id, validatedBody)));
router.put("/trades/:id/replay-notes", validate(z.object({ notes: z.string().trim().max(4000) })), respond(({ user, params, validatedBody }) =>
  risk.saveTradeRecord(user, params.id, { replayNotes: validatedBody.notes })));
router.get("/trades/:id/replay", validate(z.object({ step: z.coerce.number().int().min(1).max(3100).default(10) }), "query"),
  respond(({ user, params, validatedQuery }) => risk.replay(user, params.id, validatedQuery.step)));
const scalpMode = z.enum(["auto", "minute"]).default("auto");
router.get("/trades/:id/exit-timing", validate(z.object({ window: z.coerce.number().int().min(10).max(1800).optional(), mode: scalpMode,
  summary: z.enum(["true", "false"]).optional().transform((value) => value === "true") }), "query"),
  respond(({ user, params, validatedQuery }) => validatedQuery.window == null
    ? risk.getExitTiming(user, params.id) : risk.getScalpExit(user, params.id, validatedQuery)));
router.post("/trades/:id/exit-timing/strategy", validate(z.object({
  type: z.enum(["time", "target", "stop", "trail", "ema", "partial", "breakEven"]),
  holdSeconds: z.number().int().min(1).max(1800),
  threshold: z.number().min(0.01).max(1000), stop: z.number().min(0.01).max(1000),
  partial: z.number().min(1).max(99), addedCost: z.number().min(0).max(1000), mode: scalpMode
})), respond(({ user, params, validatedBody }) => risk.runScalpStrategy(user, params.id, validatedBody)));
const exitBatch = (max) => z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(max), mode: scalpMode,
  offsets: z.array(z.number().int().min(1).max(300)).min(1).max(24),
  windows: z.array(z.number().int().min(1).max(300)).min(1).max(12) });
router.post("/exit-performance/read", validate(exitBatch(120)), respond(({ user, validatedBody }) =>
  getExitPerformanceBatch(user, validatedBody, false)));
router.post("/exit-performance/collect", validate(exitBatch(4)), respond(({ user, validatedBody }) =>
  getExitPerformanceBatch(user, validatedBody, true)));
router.post("/simulation/paths", validate(z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(10) })),
  respond(({ user, validatedBody }) => risk.getSimulationPaths(user, [...new Set(validatedBody.ids)])));

module.exports = router;
