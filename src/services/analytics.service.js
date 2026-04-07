const {
  calculateAnalytics,
  getTradePnl,
  calculateTradePnlSeries,
  calculateTotalPnl,
  calculateWinRate,
  calculateAverageWin,
  calculateAverageLoss,
  calculateExpectancy,
  calculateEquityCurve,
  calculateMaxDrawdown
} = require("../utils/tradeAnalytics");

module.exports = {
  getTradePnl,
  calculateTradePnlSeries,
  calculateTotalPnl,
  calculateWinRate,
  calculateAverageWin,
  calculateAverageLoss,
  calculateExpectancy,
  calculateEquityCurve,
  calculateMaxDrawdown,
  calculateAnalytics
};
