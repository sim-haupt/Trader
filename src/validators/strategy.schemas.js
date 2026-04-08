const { z } = require("zod");

const savedStrategySchema = z.object({
  name: z.string().trim().min(1).max(100)
});

module.exports = {
  savedStrategySchema
};
