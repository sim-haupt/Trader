const asyncHandler = require("../middleware/async-handler");
const tradeService = require("../services/trade.service");
const importService = require("../services/import.service");
const ApiError = require("../utils/ApiError");

const createTrade = asyncHandler(async (req, res) => {
  const trade = await tradeService.createTrade(req.user.id, req.validatedBody);

  res.status(201).json({
    success: true,
    data: trade
  });
});

const getTrades = asyncHandler(async (req, res) => {
  const trades = await tradeService.getTrades(req.user, req.validatedQuery || {});

  res.status(200).json({
    success: true,
    data: trades
  });
});

const getTradeById = asyncHandler(async (req, res) => {
  const trade = await tradeService.getTradeById(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: trade
  });
});

const updateTrade = asyncHandler(async (req, res) => {
  const trade = await tradeService.updateTrade(
    req.user,
    req.params.id,
    req.validatedBody
  );

  res.status(200).json({
    success: true,
    data: trade
  });
});

const deleteTrade = asyncHandler(async (req, res) => {
  const result = await tradeService.deleteTrade(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: result
  });
});

const bulkDeleteTrades = asyncHandler(async (req, res) => {
  const result = await tradeService.bulkDeleteTrades(req.user, req.validatedBody.tradeIds);

  res.status(200).json({
    success: true,
    data: result
  });
});

const bulkUpdateTrades = asyncHandler(async (req, res) => {
  const result = await tradeService.bulkUpdateTrades(req.user, req.validatedBody);

  res.status(200).json({
    success: true,
    data: result
  });
});

const deleteAllTrades = asyncHandler(async (req, res) => {
  const result = await tradeService.deleteAllTrades(req.user, req.validatedBody || {});

  res.status(200).json({
    success: true,
    data: result
  });
});

const importTrades = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required");
  }

  const result = await importService.importTradesFromCsv(req.user.id, req.file);

  res.status(200).json({
    success: true,
    data: result
  });
});

const importTradesFromText = asyncHandler(async (req, res) => {
  const result = await importService.importTradesFromText(req.user.id, req.validatedBody.text);

  res.status(200).json({
    success: true,
    data: result
  });
});

module.exports = {
  createTrade,
  getTrades,
  getTradeById,
  updateTrade,
  deleteTrade,
  bulkDeleteTrades,
  bulkUpdateTrades,
  deleteAllTrades,
  importTrades,
  importTradesFromText
};
