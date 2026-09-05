const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const isCsv =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.toLowerCase().endsWith(".csv");

    if (!isCsv) {
      return cb(new ApiError(400, "Only CSV files are allowed"));
    }

    cb(null, true);
  }
});

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const fileName = file.originalname.toLowerCase();
    const isExcel =
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fileName.endsWith(".csv") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".xlsx");

    if (!isExcel) {
      return cb(new ApiError(400, "Only CSV, XLS or XLSX files are allowed"));
    }

    cb(null, true);
  }
});

const tradeReviewUploadDir = path.join(process.cwd(), "uploads", "trade-reviews");
fs.mkdirSync(tradeReviewUploadDir, { recursive: true });

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tradeReviewUploadDir);
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname || "").toLowerCase();
      const safeExtension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)
        ? extension
        : ".png";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`);
    }
  }),
  limits: {
    fileSize: 12 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const fileName = file.originalname.toLowerCase();
    const isImage =
      file.mimetype.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".webp", ".gif"].some((extension) => fileName.endsWith(extension));

    if (!isImage) {
      return cb(new ApiError(400, "Only image files are allowed"));
    }

    cb(null, true);
  }
});

module.exports = csvUpload;
module.exports.excelUpload = excelUpload;
module.exports.imageUpload = imageUpload;
