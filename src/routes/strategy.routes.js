const express = require("express");
const strategyController = require("../controllers/strategy.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { savedStrategySchema } = require("../validators/strategy.schemas");

const router = express.Router();

router.use(authenticate);

router.get("/", strategyController.listStrategies);
router.post("/", validate(savedStrategySchema), strategyController.createStrategy);
router.delete("/:id", strategyController.deleteStrategy);

module.exports = router;
