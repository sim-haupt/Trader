const { z } = require("zod");

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

const journalDayParamsSchema = z.object({
  dayKey: z.string().regex(dayKeyPattern, "Invalid day key")
});

const journalDayNoteSchema = z.object({
  notes: z.string().max(20000).nullable().optional()
});

module.exports = {
  journalDayParamsSchema,
  journalDayNoteSchema
};
