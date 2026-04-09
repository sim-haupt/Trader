const express = require("express");
const authController = require("../controllers/auth.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { registerSchema, loginSchema, updateSettingsSchema } = require("../validators/auth.schemas");

const router = express.Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.get("/meta", authController.getMeta);
router.get("/settings", authenticate, authController.getSettings);
router.patch("/settings", authenticate, validate(updateSettingsSchema), authController.updateSettings);

module.exports = router;
