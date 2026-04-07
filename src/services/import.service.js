const { parse } = require("csv-parse/sync");
const prisma = require("../config/prisma");
const buildTradePayload = require("../utils/buildTradePayload");
const ApiError = require("../utils/ApiError");
const { validateImportTradeRow } = require("../validators/trade.schemas");

function normalizeHeaders(record) {
  const normalizedRecord = {};

  for (const [key, value] of Object.entries(record)) {
    normalizedRecord[key.trim()] = typeof value === "string" ? value.trim() : value;
  }

  return normalizedRecord;
}

function parseCsv(buffer) {
  const content = buffer.toString("utf-8");

  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }).map(normalizeHeaders);
}

async function importTradesFromCsv(userId, file) {
  let records;

  try {
    records = parseCsv(file.buffer);
  } catch (error) {
    throw new ApiError(400, "Unable to parse CSV file");
  }

  const validTrades = [];
  const invalidRows = [];

  records.forEach((row, index) => {
    const validation = validateImportTradeRow(row);

    if (!validation.success) {
      invalidRows.push({
        rowNumber: index + 2,
        rawData: row,
        errors: validation.error.issues.map((issue) => issue.message)
      });
      return;
    }

    validTrades.push(validation.data);
  });

  const result = await prisma.$transaction(async (tx) => {
    // Keep import metadata and inserted trades consistent if any write fails midway.
    const importRecord = await tx.tradeImport.create({
      data: {
        userId,
        fileName: file.originalname,
        status: invalidRows.length > 0 ? (validTrades.length > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
        totalRows: records.length,
        successfulRows: validTrades.length,
        failedRows: invalidRows.length
      }
    });

    if (invalidRows.length > 0) {
      await tx.importError.createMany({
        data: invalidRows.map((row) => ({
          importId: importRecord.id,
          rowNumber: row.rowNumber,
          rawData: row.rawData,
          errorMessage: row.errors.join(", ")
        }))
      });
    }

    const inserted =
      validTrades.length > 0
        ? await tx.trade.createMany({
            data: validTrades.map((trade) => buildTradePayload(trade, userId))
          })
        : { count: 0 };

    return {
      importId: importRecord.id,
      insertedCount: inserted.count || 0
    };
  });

  return {
    importId: result.importId,
    fileName: file.originalname,
    totalRows: records.length,
    insertedCount: result.insertedCount,
    errorCount: invalidRows.length,
    errors: invalidRows
  };
}

module.exports = {
  importTradesFromCsv
};
