const asyncHandler = require("../middleware/async-handler");
const marketDataService = require("../services/market-data.service");

const getBars = asyncHandler(async (req, res) => {
  const data = await marketDataService.getBars(req.validatedQuery);

  res.status(200).json({
    success: true,
    data
  });
});

module.exports = {
  getBars
};
