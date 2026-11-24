import { buildExitReport, exitTradeMetadata } from "./exitReportMetrics.mjs";

let rows = [];

self.onmessage = ({ data }) => {
  try {
    if (data.rows) rows = data.rows.map(({ trade, row }) => ({ ...row, ...exitTradeMetadata(trade, row) }));
    self.postMessage({ version: data.version, report: buildExitReport(rows, data.options) });
  } catch (error) {
    self.postMessage({ version: data.version, error: error.message });
  }
};
