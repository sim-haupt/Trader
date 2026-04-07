const express = require("express");
const tagController = require("../controllers/tag.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { savedTagSchema } = require("../validators/tag.schemas");

const router = express.Router();

router.use(authenticate);

router.get("/", tagController.listTags);
router.post("/", validate(savedTagSchema), tagController.createTag);
router.delete("/:id", tagController.deleteTag);

module.exports = router;
