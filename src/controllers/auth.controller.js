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

module.exports = {
  register,
  login
};
