const { z } = require("zod");

const tradeReviewQuerySchema = z.object({
  tag: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (!value) {
        return [];
      }

      return (Array.isArray(value) ? value : [value])
        .flatMap((item) => String(item).split(","))
        .map((item) => item.trim())
        .filter(Boolean);
    })
});

module.exports = {
  tradeReviewQuerySchema
};
