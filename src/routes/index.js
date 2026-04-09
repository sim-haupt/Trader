const express = require("express");
const authRoutes = require("./auth.routes");
const marketDataRoutes = require("./market-data.routes");
const journalRoutes = require("./journal.routes");
const publicRoutes = require("./public.routes");
const strategyRoutes = require("./strategy.routes");
const tagRoutes = require("./tag.routes");
const tradeRoutes = require("./trade.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/public", publicRoutes);
router.use("/market-data", marketDataRoutes);
router.use("/journal-days", journalRoutes);
router.use("/strategies", strategyRoutes);
router.use("/tags", tagRoutes);
router.use("/trades", tradeRoutes);

module.exports = router;
