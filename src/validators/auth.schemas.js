const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6).max(100)
});

const updateSettingsSchema = z.object({
  activeAccountScope: z.enum(["SIMULATOR", "LIVE"]).optional(),
  liveDataStartDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()]).optional(),
  defaultCommission: z.coerce.number().min(0).max(100000).optional(),
  defaultFees: z.coerce.number().min(0).max(100000).optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  updateSettingsSchema
};
