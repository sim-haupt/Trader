const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/auth.middleware");
const asyncHandler = require("../middleware/async-handler");
const { imageUpload } = require("../middleware/upload.middleware");
const validate = require("../middleware/validate.middleware");
const { gradeSchema } = require("../validators/entry-grade.schemas");
const { savedStrategySchema } = require("../validators/strategy.schemas");
const setups = require("../services/setup.service");

const router = express.Router();
const detailsSchema = z.object({
  notes: z.string().transform((value) => value.replace(/\r\n/g, "\n").trim()).pipe(z.string().max(20000)),
  grade: gradeSchema.shape.letterGrade.or(z.literal("")),
  shareSize: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(2147483647)]),
  thumbnails: z.string().optional()
});
const uploadImages = imageUpload.array("images", setups.MAX_IMAGES);

router.use(authenticate);

router.get("/", asyncHandler(async (req, res) => {
  res.json({ success: true, data: await setups.list(req.user.id) });
}));

router.post("/", uploadImages, validate(savedStrategySchema.merge(detailsSchema)), asyncHandler(async (req, res) => {
  const setup = await setups.create(req.user.id, req.validatedBody, req.files);
  res.status(201).json({ success: true, data: setup });
}));

router.patch("/:id", uploadImages, validate(detailsSchema), asyncHandler(async (req, res) => {
  const setup = await setups.update(req.user.id, req.params.id, req.validatedBody, req.files);
  res.json({ success: true, data: setup });
}));

router.get("/images/:id", asyncHandler(async (req, res) => {
  const image = await setups.getImage(req.user.id, req.params.id);
  res.set("Cache-Control", "private, no-store");
  res.type(image.mimeType).send(Buffer.from(image.data));
}));

module.exports = router;
