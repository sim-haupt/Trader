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

const createReviewImage = asyncHandler(async (req, res) => {
  const image = await tradeReviewService.createReviewImage(req.user, req.file, req.body);

  res.status(201).json({
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
  createReviewImage,
  deleteReviewImage
};
