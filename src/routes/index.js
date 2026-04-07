const express = require("express");
const authRoutes = require("./auth.routes");
const tradeRoutes = require("./trade.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/trades", tradeRoutes);

module.exports = router;
