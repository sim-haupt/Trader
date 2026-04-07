const express = require("express");
const authRoutes = require("./auth.routes");
const marketDataRoutes = require("./market-data.routes");
const tagRoutes = require("./tag.routes");
const tradeRoutes = require("./trade.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/market-data", marketDataRoutes);
router.use("/tags", tagRoutes);
router.use("/trades", tradeRoutes);

module.exports = router;
