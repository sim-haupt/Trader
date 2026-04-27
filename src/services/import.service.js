const { parse } = require("csv-parse/sync");
const { randomUUID } = require("crypto");
const prisma = require("../config/prisma");
const buildTradePayload = require("../utils/buildTradePayload");
const ApiError = require("../utils/ApiError");
const { validateImportTradeRow } = require("../validators/trade.schemas");
const {
  getTradeImportContext,
  scheduleTradeImportContextBackfill
} = require("./market-data.service");
const parseNewYorkLocalDateTime = require("../utils/parseMarketDateTime");
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
    occurredAt: parseNewYorkLocalDateTime(execution.occurredAt),
    quantity: execution.quantity,
    price: execution.price,
    action: execution.action,
    sequence: execution.sequence,
    positionAfter: execution.positionAfter ?? null,
    source: execution.source || "IMPORTED"
  };
}

function getTradeEnrichmentKey(trade) {
  const symbol = String(trade.symbol || "").trim().toUpperCase();
  const entryDate = trade.entryDate ? new Date(trade.entryDate) : null;
  const entryPrice = Number(trade.entryPrice);

  if (!symbol || !entryDate || Number.isNaN(entryDate.getTime())) {
    return null;
  }

  return `${symbol}:${entryDate.toISOString()}:${Number.isFinite(entryPrice) ? entryPrice.toFixed(4) : "na"}`;
}

async function enrichImportedTrades(validTrades) {
  const enrichmentCache = new Map();
  const enrichedTrades = [];

  for (const trade of validTrades) {
    const cacheKey = getTradeEnrichmentKey(trade);

    if (cacheKey && !enrichmentCache.has(cacheKey)) {
      enrichmentCache.set(
        cacheKey,
        await getTradeImportContext({
          symbol: trade.symbol,
          entryDate: trade.entryDate,
          entryPrice: trade.entryPrice
        })
      );
    }

    const enrichment = cacheKey ? enrichmentCache.get(cacheKey) : null;

    enrichedTrades.push({
      ...trade,
      ...(enrichment || {})
    });
  }

  return enrichedTrades;
}

async function importTradesFromCsv(actor, file) {
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
    actor,
    file.originalname,
    validTrades,
    invalidRows,
    records.length
  );
}

async function persistImportedTrades(actor, sourceName, validTrades, invalidRows, totalRows) {
  const userId = actor.id;
  const accountScope = actor.activeAccountScope || "SIMULATOR";
  const enrichedTrades = await enrichImportedTrades(validTrades);
  const importId = randomUUID();
  const savedTags = [...new Set(
    enrichedTrades.flatMap((trade) =>
      String(trade.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )];
  const savedStrategies = [...new Set(
    enrichedTrades
      .map((trade) => String(trade.strategy || "").trim())
      .filter(Boolean)
  )];
  const tradeRows = enrichedTrades.map((trade) => {
    const tradeId = randomUUID();

    return {
      id: tradeId,
      payload: {
        id: tradeId,
        ...buildTradePayload(trade, userId, accountScope)
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
        accountScope,
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

  if (savedTags.length > 0) {
    operations.push(
      prisma.savedTag.createMany({
        data: savedTags.map((name) => ({ id: randomUUID(), userId, name })),
        skipDuplicates: true
      })
    );
  }

  if (savedStrategies.length > 0) {
    operations.push(
      prisma.savedStrategy.createMany({
        data: savedStrategies.map((name) => ({ id: randomUUID(), userId, name })),
        skipDuplicates: true
      })
    );
  }

  await prisma.$transaction(operations);

  tradeRows.forEach((trade) => {
    if (trade.payload.marketDataNeedsBackfill) {
      scheduleTradeImportContextBackfill({
        id: trade.payload.id,
        symbol: trade.payload.symbol,
        entryDate: trade.payload.entryDate,
        entryPrice: trade.payload.entryPrice,
        marketDataNeedsBackfill: trade.payload.marketDataNeedsBackfill
      });
    }
  });

  return {
    importId,
    fileName: sourceName,
    totalRows,
    insertedCount: tradeRows.length,
    errorCount: invalidRows.length,
    errors: invalidRows
  };
}

async function importTradesFromText(actor, text) {
  const parsed = parseTradesFromText(text);

  if (parsed.totalRows === 0) {
    throw new ApiError(400, "Trade text is empty");
  }

  return persistImportedTrades(
    actor,
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
