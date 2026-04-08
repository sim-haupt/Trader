const asyncHandler = require("../middleware/async-handler");
const strategyService = require("../services/strategy.service");

const listStrategies = asyncHandler(async (req, res) => {
  const strategies = await strategyService.listStrategies(req.user);

  res.status(200).json({
    success: true,
    data: strategies
  });
});

const createStrategy = asyncHandler(async (req, res) => {
  const strategy = await strategyService.createStrategy(req.user, req.validatedBody);

  res.status(201).json({
    success: true,
    data: strategy
  });
});

const deleteStrategy = asyncHandler(async (req, res) => {
  const result = await strategyService.deleteStrategy(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: result
  });
});

module.exports = {
  listStrategies,
  createStrategy,
  deleteStrategy
};
