const { z } = require("zod");

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const journalDayParamsSchema = z.object({
  dayKey: z.string().regex(dayKeyPattern, "Invalid day key")
});

const journalDayNoteSchema = z.object({
  notes: z.string().max(20000).nullable().optional(),
  secFee: z.coerce.number().min(0).max(100000).optional(),
  finraFee: z.coerce.number().min(0).max(100000).optional()
});

const journalFxRatesQuerySchema = z.object({
  days: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((dayKey) => dayKey.trim())
        .filter(Boolean)
    )
    .refine(
      (dayKeys) => dayKeys.length > 0 && dayKeys.every((dayKey) => dayKeyPattern.test(dayKey)),
      "Invalid day keys"
    )
});

module.exports = {
  journalDayParamsSchema,
  journalDayNoteSchema,
  journalFxRatesQuerySchema
};
