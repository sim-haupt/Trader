const asyncHandler = require("../middleware/async-handler");
const tradeReviewService = require("../services/trade-review.service");

const listReviewImages = asyncHandler(async (req, res) => {
  const images = await tradeReviewService.listReviewImages(req.user, req.validatedQuery);

  res.status(200).json({
    success: true,
    data: images
  });
});

const listReviewTags = asyncHandler(async (req, res) => {
  const tags = await tradeReviewService.listReviewTags(req.user);

  res.status(200).json({
    success: true,
    data: tags
  });
});

const createReviewTag = asyncHandler(async (req, res) => {
  const tag = await tradeReviewService.createReviewTag(req.user, req.body);

  res.status(201).json({
    success: true,
    data: tag
  });
});

const updateReviewTag = asyncHandler(async (req, res) => {
  const tag = await tradeReviewService.updateReviewTag(req.user, req.params.id, req.body);

  res.status(200).json({
    success: true,
    data: tag
  });
});

const deleteReviewTag = asyncHandler(async (req, res) => {
  const result = await tradeReviewService.deleteReviewTag(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: result
  });
});

const getReviewImage = asyncHandler(async (req, res) => {
  const image = await tradeReviewService.getReviewImage(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: image
  });
});

const createReviewImages = asyncHandler(async (req, res) => {
  const images = await tradeReviewService.createReviewImages(req.user, req.files, req.body);

  res.status(201).json({
    success: true,
    data: images
  });
});

const updateReviewImage = asyncHandler(async (req, res) => {
  const image = await tradeReviewService.updateReviewImage(req.user, req.params.id, req.body);

  res.status(200).json({
    success: true,
    data: image
  });
});

const deleteReviewImage = asyncHandler(async (req, res) => {
  const result = await tradeReviewService.deleteReviewImage(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: result
  });
});

module.exports = {
  listReviewImages,
  listReviewTags,
  createReviewTag,
  updateReviewTag,
  deleteReviewTag,
  getReviewImage,
  createReviewImages,
  updateReviewImage,
  deleteReviewImage
};
