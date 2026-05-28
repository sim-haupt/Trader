const { z } = require("zod");

function isValidDateString(value) {
  return !Number.isNaN(new Date(value).getTime());
}

const marketBarsQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  resolution: z.enum(["1m"]),
  from: z.string().refine(isValidDateString, "from must be a valid date"),
  to: z.string().refine(isValidDateString, "to must be a valid date"),
  includeExtended: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value !== "false")
});

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a valid day key");

const fxRatesQuerySchema = z
  .object({
    from: dayKeySchema,
    to: dayKeySchema
  })
  .refine((value) => value.from <= value.to, {
    message: "from must be before or equal to to",
    path: ["to"]
  });

module.exports = {
  marketBarsQuerySchema,
  fxRatesQuerySchema
};
