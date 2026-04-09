const express = require("express");
const tradeController = require("../controllers/trade.controller");
const validate = require("../middleware/validate.middleware");
const { tradeQuerySchema } = require("../validators/trade.schemas");

const router = express.Router();

router.get(
  "/trades/widget-summary/:userId",
  validate(tradeQuerySchema, "query"),
  tradeController.getPublicWidgetSummary
);

module.exports = router;
