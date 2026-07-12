import api from "./api";

function extractData(response) {
  return response.data.data;
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function downloadFile(url, filename, params = {}) {
  const response = await api.get(url, {
    params: cleanParams(params),
    responseType: "blob"
  });
  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

const taxReportService = {
  async getSettings() {
    return extractData(await api.get("/tax-reports/settings"));
  },

  async updateSettings(payload) {
    return extractData(await api.put("/tax-reports/settings", payload));
  },

  async uploadStatement({ file, brokerName, brokerAccount, currency }) {
    const formData = new FormData();
    formData.append("file", file);
    if (brokerName) formData.append("brokerName", brokerName);
    if (brokerAccount) formData.append("brokerAccount", brokerAccount);
    if (currency) formData.append("currency", currency);

    return extractData(await api.post("/tax-reports/statements/upload", formData));
  },

  async uploadExchangeRates({ file, sourceName }) {
    const formData = new FormData();
    formData.append("file", file);
    if (sourceName) formData.append("sourceName", sourceName);

    return extractData(await api.post("/tax-reports/exchange-rates/upload", formData));
  },

  async applyExchangeRates() {
    return extractData(await api.post("/tax-reports/exchange-rates/apply"));
  },

  async getStatements() {
    return extractData(await api.get("/tax-reports/statements"));
  },

  async getTransactions(filters = {}) {
    return extractData(await api.get("/tax-reports/transactions", { params: cleanParams(filters) }));
  },

  async updateTransaction(id, payload) {
    return extractData(await api.patch(`/tax-reports/transactions/${id}`, payload));
  },

  async getOverview(filters = {}) {
    return extractData(await api.get("/tax-reports/overview", { params: cleanParams(filters) }));
  },

  async getReport(filters = {}) {
    return extractData(await api.get("/tax-reports/report", { params: cleanParams(filters) }));
  },

  async finalizeReport(payload) {
    return extractData(await api.post("/tax-reports/reports/finalize", payload));
  },

  downloadStatement(id, filename) {
    return downloadFile(`/tax-reports/statements/${id}/download`, filename || "statement.xls");
  },

  downloadTransactionsCsv(filters = {}) {
    return downloadFile("/tax-reports/export/transactions.csv", "tax-transactions.csv", filters);
  },

  downloadWorkbook(filters = {}) {
    return downloadFile("/tax-reports/export/workbook.xlsx", "tax-report-export.xlsx", filters);
  },

  downloadPdf(filters = {}) {
    return downloadFile("/tax-reports/export/report.pdf", "tax-report.pdf", filters);
  },

  downloadEvidenceZip(filters = {}) {
    return downloadFile("/tax-reports/export/evidence.zip", "tax-evidence-package.zip", filters);
  }
};

export default taxReportService;
