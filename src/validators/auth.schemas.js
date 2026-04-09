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

const dashboardLayoutItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  span: z.coerce.number().int().min(1).max(5)
});

const updateSettingsSchema = z.object({
  defaultCommission: z.coerce.number().min(0).max(100000).optional(),
  defaultFees: z.coerce.number().min(0).max(100000).optional(),
  dashboardLayout: z.array(dashboardLayoutItemSchema).max(32).optional()
});

module.exports = {
  registerSchema,
  loginSchema,
  updateSettingsSchema
};
