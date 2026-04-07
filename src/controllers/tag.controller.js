const asyncHandler = require("../middleware/async-handler");
const tagService = require("../services/tag.service");

const listTags = asyncHandler(async (req, res) => {
  const tags = await tagService.listTags(req.user);

  res.status(200).json({
    success: true,
    data: tags
  });
});

const createTag = asyncHandler(async (req, res) => {
  const tag = await tagService.createTag(req.user, req.validatedBody);

  res.status(201).json({
    success: true,
    data: tag
  });
});

const deleteTag = asyncHandler(async (req, res) => {
  const result = await tagService.deleteTag(req.user, req.params.id);

  res.status(200).json({
    success: true,
    data: result
  });
});

module.exports = {
  listTags,
  createTag,
  deleteTag
};
