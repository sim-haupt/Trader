const { z } = require("zod");

function isValidDateString(value) {
  return !Number.isNaN(new Date(value).getTime());
}

const tradeSchema = z
  .object({
    symbol: z.string().trim().min(1).max(20),
    side: z.enum(["LONG", "SHORT"]),
    quantity: z.coerce.number().positive(),
    entryPrice: z.coerce.number().positive(),
    exitPrice: z.coerce.number().positive().nullable().optional(),
    entryDate: z.string().min(1).refine(isValidDateString, "entryDate must be a valid date"),
    exitDate: z
      .string()
      .min(1)
      .refine(isValidDateString, "exitDate must be a valid date")
      .nullable()
      .optional(),
    fees: z.coerce.number().min(0).optional(),
    strategy: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional()
  })
  .superRefine((data, context) => {
    if (data.exitDate && !data.exitPrice) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exitPrice is required when exitDate is provided",
        path: ["exitPrice"]
      });
    }

    if (data.exitPrice && !data.exitDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exitDate is required when exitPrice is provided",
        path: ["exitDate"]
      });
    }

    if (data.exitDate && data.exitPrice && new Date(data.exitDate) < new Date(data.entryDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exitDate must be after or equal to entryDate",
        path: ["exitDate"]
      });
    }
  });

const bulkDeleteSchema = z.object({
  tradeIds: z.array(z.string().min(1)).min(1)
});

const tradeQuerySchema = z.object({
  symbol: z.string().trim().max(20).optional(),
  side: z.enum(["LONG", "SHORT"]).optional(),
  strategy: z.string().trim().max(100).optional(),
  from: z.string().refine(isValidDateString, "from must be a valid date").optional(),
  to: z.string().refine(isValidDateString, "to must be a valid date").optional(),
  scope: z.enum(["all"]).optional()
});

function mapImportRowToPayload(row) {
  return {
    symbol: String(row.symbol || "").trim().toUpperCase(),
    side: String(row.side || "").trim().toUpperCase(),
    quantity: row.quantity,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice === "" || row.exitPrice === undefined ? null : row.exitPrice,
    entryDate: row.entryDate,
    exitDate: row.exitDate === "" || row.exitDate === undefined ? null : row.exitDate,
    fees: row.fees === "" || row.fees === undefined ? 0 : row.fees,
    strategy: row.strategy ? String(row.strategy).trim() : null,
    notes: row.notes ? String(row.notes).trim() : null
  };
}

function validateImportTradeRow(row) {
  const normalizedRow = mapImportRowToPayload(row);
  return tradeSchema.safeParse(normalizedRow);
}

module.exports = {
  tradeSchema,
  bulkDeleteSchema,
  tradeQuerySchema,
  validateImportTradeRow
};
