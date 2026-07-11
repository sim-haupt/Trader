const express = require("express");
const taxReportController = require("../controllers/tax-report.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { excelUpload } = require("../middleware/upload.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/settings", taxReportController.getSettings);
router.put("/settings", taxReportController.updateSettings);
router.get("/statements", taxReportController.listStatements);
router.post("/statements/upload", excelUpload.single("file"), taxReportController.uploadStatement);
router.get("/statements/:id/download", taxReportController.downloadStatement);
router.get("/transactions", taxReportController.listTransactions);
router.patch("/transactions/:id", taxReportController.updateTransaction);
router.get("/overview", taxReportController.getOverview);
router.get("/report", taxReportController.getReportData);
router.get("/export/transactions.csv", taxReportController.exportTransactionsCsv);
router.get("/export/workbook.xlsx", taxReportController.exportWorkbook);
router.get("/export/report.pdf", taxReportController.exportPdf);
router.post("/reports/finalize", taxReportController.finalizeReport);

module.exports = router;
