const express = require("express");
const tradeController = require("../controllers/trade.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate, authorizeRoles } = require("../middleware/auth.middleware");
const upload = require("../middleware/upload.middleware");
const {
  tradeSchema,
  bulkDeleteSchema,
  deleteAllTradesSchema,
  tradeQuerySchema,
  tradeTextImportSchema
} = require("../validators/trade.schemas");

const router = express.Router();

router.use(authenticate);

router.post("/", validate(tradeSchema), tradeController.createTrade);
router.get("/", validate(tradeQuerySchema, "query"), tradeController.getTrades);
router.put("/:id", validate(tradeSchema), tradeController.updateTrade);
router.delete("/:id", tradeController.deleteTrade);
router.post("/delete-all", validate(deleteAllTradesSchema), tradeController.deleteAllTrades);
router.post(
  "/bulk-delete",
  authorizeRoles("ADMIN"),
  validate(bulkDeleteSchema),
  tradeController.bulkDeleteTrades
);
router.post("/import", upload.single("file"), tradeController.importTrades);
router.post("/import-text", validate(tradeTextImportSchema), tradeController.importTradesFromText);

module.exports = router;
