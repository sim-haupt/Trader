const asyncHandler = require("../middleware/async-handler");
const ApiError = require("../utils/ApiError");
const taxReportService = require("../services/tax-report.service");

const getSettings = asyncHandler(async (req, res) => {
  const settings = await taxReportService.getSettings(req.user);
  res.status(200).json({ success: true, data: settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await taxReportService.updateSettings(req.user, req.body || {});
  res.status(200).json({ success: true, data: settings });
});

const uploadStatement = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Statement file is required.");
  }

  const statement = await taxReportService.importStatement(req.user, req.file, req.body || {});
  res.status(201).json({ success: true, data: statement });
});

const listStatements = asyncHandler(async (req, res) => {
  const statements = await taxReportService.listStatements(req.user);
  res.status(200).json({ success: true, data: statements });
});

const downloadStatement = asyncHandler(async (req, res) => {
  const { statement, buffer } = await taxReportService.getSourceFile(req.user, req.params.id);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${statement.originalFilename.replace(/"/g, "")}"`);
  res.send(buffer);
});

const listTransactions = asyncHandler(async (req, res) => {
  const transactions = await taxReportService.listTransactions(req.user, req.query || {});
  res.status(200).json({ success: true, data: transactions });
});

const updateTransaction = asyncHandler(async (req, res) => {
  const transaction = await taxReportService.updateTransaction(req.user, req.params.id, req.body || {});
  res.status(200).json({ success: true, data: transaction });
});

const getOverview = asyncHandler(async (req, res) => {
  const overview = await taxReportService.getOverview(req.user, req.query || {});
  res.status(200).json({ success: true, data: overview });
});

const getReportData = asyncHandler(async (req, res) => {
  const report = await taxReportService.buildReportData(req.user, req.query || {});
  res.status(200).json({ success: true, data: report });
});

const exportTransactionsCsv = asyncHandler(async (req, res) => {
  const csv = await taxReportService.exportTransactionsCsv(req.user, req.query || {});
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"tax-transactions.csv\"");
  res.send(csv);
});

const exportWorkbook = asyncHandler(async (req, res) => {
  const workbook = await taxReportService.exportWorkbook(req.user, req.query || {});
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=\"tax-report-export.xlsx\"");
  res.send(workbook);
});

const exportPdf = asyncHandler(async (req, res) => {
  const pdf = await taxReportService.exportPdf(req.user, req.query || {});
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=\"tax-report.pdf\"");
  res.send(pdf);
});

const finalizeReport = asyncHandler(async (req, res) => {
  const report = await taxReportService.finalizeReport(req.user, req.body || {});
  res.status(201).json({ success: true, data: report });
});

module.exports = {
  getSettings,
  updateSettings,
  uploadStatement,
  listStatements,
  downloadStatement,
  listTransactions,
  updateTransaction,
  getOverview,
  getReportData,
  exportTransactionsCsv,
  exportWorkbook,
  exportPdf,
  finalizeReport
};
