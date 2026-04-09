const express = require("express");
const tradeController = require("../controllers/trade.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const {
  tradeSchema,
  bulkDeleteSchema,
  bulkUpdateTradesSchema,
  tradeMetaSchema,
  deleteAllTradesSchema,
  tradeQuerySchema,
  tradeTextImportSchema
} = require("../validators/trade.schemas");

const router = express.Router();

router.use(authenticate);

router.post("/", validate(tradeSchema), tradeController.createTrade);
router.get("/", validate(tradeQuerySchema, "query"), tradeController.getTrades);
router.get("/widget-summary", validate(tradeQuerySchema, "query"), tradeController.getWidgetSummary);
router.get("/tags", tradeController.getTradeTags);
router.get("/:id", tradeController.getTradeById);
router.put("/:id", validate(tradeSchema), tradeController.updateTrade);
router.patch("/:id/meta", validate(tradeMetaSchema), tradeController.updateTradeMeta);
router.delete("/:id", tradeController.deleteTrade);
router.post("/delete-all", validate(deleteAllTradesSchema), tradeController.deleteAllTrades);
router.post("/bulk-update", validate(bulkUpdateTradesSchema), tradeController.bulkUpdateTrades);
router.post(
  "/bulk-delete",
  validate(bulkDeleteSchema),
  tradeController.bulkDeleteTrades
);
router.post("/import", upload.single("file"), tradeController.importTrades);
router.post("/import-text", validate(tradeTextImportSchema), tradeController.importTradesFromText);

module.exports = router;
