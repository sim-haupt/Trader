const { parse } = require("csv-parse/sync");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const buildTradePayload = require("../utils/buildTradePayload");
const ApiError = require("../utils/ApiError");
const { validateImportTradeRow } = require("../validators/trade.schemas");
const {
  normalizeImportedCsvRow,
  parseTradesFromText
} = require("../utils/tradeImportParsers");

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

function buildExecutionCreateInput(execution) {
  return {
    occurredAt: new Date(execution.occurredAt),
    quantity: execution.quantity,
    price: execution.price,
    action: execution.action,
    sequence: execution.sequence,
    positionAfter: execution.positionAfter ?? null,
    source: execution.source || "IMPORTED"
  };
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
    const validation = validateImportTradeRow(normalizeImportedCsvRow(row));

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

  return persistImportedTrades(
    userId,
    file.originalname,
    validTrades,
    invalidRows,
    records.length
  );
}

async function persistImportedTrades(userId, sourceName, validTrades, invalidRows, totalRows) {
  const importId = randomUUID();
  const tradeRows = validTrades.map((trade) => {
    const tradeId = randomUUID();

    return {
      id: tradeId,
      payload: {
        id: tradeId,
        ...buildTradePayload(trade, userId)
      },
      executions: (Array.isArray(trade.executions) ? trade.executions : []).map((execution) => ({
        id: randomUUID(),
        tradeId,
        ...buildExecutionCreateInput(execution)
      }))
    };
  });

  const executionRows = tradeRows.flatMap((trade) => trade.executions);
  const operations = [
    prisma.tradeImport.create({
      data: {
        id: importId,
        userId,
        fileName: sourceName,
        status: invalidRows.length > 0 ? (validTrades.length > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
        totalRows,
        successfulRows: validTrades.length,
        failedRows: invalidRows.length
      }
    })
  ];

  if (invalidRows.length > 0) {
    operations.push(
      prisma.importError.createMany({
        data: invalidRows.map((row) => ({
          id: randomUUID(),
          importId,
          rowNumber: row.rowNumber ?? 0,
          rawData: row.rawData,
          errorMessage: row.errors.join(", ")
        }))
      })
    );
  }

  if (tradeRows.length > 0) {
    operations.push(
      prisma.trade.createMany({
        data: tradeRows.map((trade) => trade.payload)
      })
    );
  }

  if (executionRows.length > 0) {
    operations.push(
      prisma.tradeExecution.createMany({
        data: executionRows
      })
    );
  }

  await prisma.$transaction(operations);

  return {
    importId,
    fileName: sourceName,
    totalRows,
    insertedCount: tradeRows.length,
    errorCount: invalidRows.length,
    errors: invalidRows
  };
}

async function importTradesFromText(userId, text) {
  const parsed = parseTradesFromText(text);

  if (parsed.totalRows === 0) {
    throw new ApiError(400, "Trade text is empty");
  }

  return persistImportedTrades(
    userId,
    "manual-text-import",
    parsed.trades,
    parsed.invalidRows,
    parsed.totalRows
  );
}

module.exports = {
  importTradesFromCsv,
  importTradesFromText
};
