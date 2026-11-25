const { z } = require("zod");

const amount = z.number().finite().min(0.0001).max(1_000_000_000).nullable();
const gradeSchema = z.object({
  letterGrade: z.enum(["A+", "A", "B", "C"])
});
const blindGradeSchema = gradeSchema.extend({
  plannedStop: amount.optional(),
  plannedInitialRisk: amount.optional(),
  intendedPrice: amount.optional()
});

module.exports = { gradeSchema, blindGradeSchema, amount };
