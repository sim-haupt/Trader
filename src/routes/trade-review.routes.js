const express = require("express");
const tradeReviewController = require("../controllers/trade-review.controller");
const validate = require("../middleware/validate.middleware");
const { authenticate } = require("../middleware/auth.middleware");
const { imageUpload } = require("../middleware/upload.middleware");
const { tradeReviewQuerySchema } = require("../validators/trade-review.schemas");

const router = express.Router();

router.use(authenticate);

router.get("/", validate(tradeReviewQuerySchema, "query"), tradeReviewController.listReviewImages);
router.get("/tags", tradeReviewController.listReviewTags);
router.post("/tags", tradeReviewController.createReviewTag);
router.put("/tags/:id", tradeReviewController.updateReviewTag);
router.delete("/tags/:id", tradeReviewController.deleteReviewTag);
router.get("/:id", tradeReviewController.getReviewImage);
router.post("/", imageUpload.array("images", 20), tradeReviewController.createReviewImages);
router.put("/:id", tradeReviewController.updateReviewImage);
router.delete("/:id", tradeReviewController.deleteReviewImage);

module.exports = router;
