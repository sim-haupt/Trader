const express = require("express");
const journalController = require("../controllers/journal.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const {
  journalDayParamsSchema,
  journalDayNoteSchema,
  journalFxRatesQuerySchema
} = require("../validators/journal.schemas");

const router = express.Router();

router.use(authenticate);

router.get("/", journalController.listJournalDays);
router.get(
  "/fx-rates",
  validate(journalFxRatesQuerySchema, "query"),
  journalController.getUsdEurRates
);
router.patch(
  "/:dayKey",
  validate(journalDayParamsSchema, "params"),
  validate(journalDayNoteSchema),
  journalController.updateJournalDay
);

module.exports = router;
