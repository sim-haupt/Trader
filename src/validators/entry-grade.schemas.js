const { z } = require("zod");

const score = z.number().int().min(0).max(2);
const amount = z.number().finite().min(0.0001).max(1_000_000_000).nullable();
const gradeSchema = z.object({
  setupFit: score,
  timing: score,
  invalidation: score,
  liquidity: score,
  wouldRetake: z.boolean(),
  notes: z.string().trim().min(1).max(4000),
  plannedStop: amount.default(null),
  plannedInitialRisk: amount.default(null),
  intendedPrice: amount.default(null)
});

module.exports = { gradeSchema, amount };
