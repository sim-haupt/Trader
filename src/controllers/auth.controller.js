const asyncHandler = require("../middleware/async-handler");
const authService = require("../services/auth.service");

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.validatedBody);

  res.status(201).json({
    success: true,
    data: result
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.validatedBody);

  res.status(200).json({
    success: true,
    data: result
  });
});

const getSettings = asyncHandler(async (req, res) => {
  const result = await authService.getSettings(req.user);

  res.status(200).json({
    success: true,
    data: result
  });
});

const updateSettings = asyncHandler(async (req, res) => {
  const result = await authService.updateSettings(req.user, req.validatedBody);

  res.status(200).json({
    success: true,
    data: result
  });
});

module.exports = {
  register,
  login,
  getSettings,
  updateSettings
};
