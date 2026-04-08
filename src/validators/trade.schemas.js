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
    tags: z.string().trim().max(500).nullable().optional(),
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

const bulkUpdateTradesSchema = z
  .object({
    tradeIds: z.array(z.string().min(1)).min(1),
    tags: z.string().trim().max(500).optional(),
    strategy: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
    tagsMode: z.enum(["append", "replace"]).optional()
  })
  .superRefine((data, context) => {
    if (!data.tags && !data.notes && data.strategy === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of tags, strategy or notes is required"
      });
    }
  });

const tradeMetaSchema = z
  .object({
    tags: z.string().trim().max(500).nullable().optional(),
    strategy: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tagsMode: z.enum(["append", "replace"]).optional()
  })
  .superRefine((data, context) => {
    if (data.tags === undefined && data.notes === undefined && data.strategy === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of tags, strategy or notes is required"
      });
    }
  });

const deleteAllTradesSchema = z.object({
  scope: z.enum(["all"]).optional()
});

const tradeTextImportSchema = z.object({
  text: z.string().trim().min(1)
});

const executionImportSchema = z.object({
  occurredAt: z.string().min(1).refine(isValidDateString, "execution occurredAt must be a valid date"),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive(),
  action: z.enum(["BUY", "SELL"]),
  sequence: z.coerce.number().int().positive(),
  positionAfter: z.coerce.number().nullable().optional(),
  source: z.enum(["IMPORTED", "SYNTHETIC"]).optional()
});

const importTradeSchema = tradeSchema.and(
  z.object({
    grossPnl: z.coerce.number().nullable().optional(),
    netPnl: z.coerce.number().nullable().optional(),
    reportedExecutionCount: z.coerce.number().int().positive().nullable().optional(),
    executions: z.array(executionImportSchema).optional()
  })
);

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
    grossPnl: row.grossPnl === "" || row.grossPnl === undefined ? null : row.grossPnl,
    netPnl: row.netPnl === "" || row.netPnl === undefined ? null : row.netPnl,
    reportedExecutionCount:
      row.reportedExecutionCount === "" || row.reportedExecutionCount === undefined
        ? null
        : row.reportedExecutionCount,
    executions: Array.isArray(row.executions) ? row.executions : [],
    strategy: row.strategy ? String(row.strategy).trim() : null,
    tags: row.tags ? String(row.tags).trim() : null,
    notes: row.notes ? String(row.notes).trim() : null
  };
}

function validateImportTradeRow(row) {
  const normalizedRow = mapImportRowToPayload(row);
  return importTradeSchema.safeParse(normalizedRow);
}

module.exports = {
  tradeSchema,
  bulkDeleteSchema,
  bulkUpdateTradesSchema,
  tradeMetaSchema,
  deleteAllTradesSchema,
  tradeQuerySchema,
  tradeTextImportSchema,
  validateImportTradeRow
};
