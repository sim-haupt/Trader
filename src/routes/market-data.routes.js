const express = require("express");
const marketDataController = require("../controllers/market-data.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { marketBarsQuerySchema } = require("../validators/market-data.schemas");

const router = express.Router();

router.use(authenticate);

router.get("/bars", validate(marketBarsQuerySchema, "query"), marketDataController.getBars);

module.exports = router;
