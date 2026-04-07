const { z } = require("zod");

function isValidDateString(value) {
  return !Number.isNaN(new Date(value).getTime());
}

const marketBarsQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  resolution: z.enum(["1m", "10s"]),
  from: z.string().refine(isValidDateString, "from must be a valid date"),
  to: z.string().refine(isValidDateString, "to must be a valid date"),
  includeExtended: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false")
});

module.exports = {
  marketBarsQuerySchema
};
