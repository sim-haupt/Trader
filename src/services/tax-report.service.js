const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");

const IMPORTER_KEY = "WARRIOR_TRADES_XLS_V1";
const IMPORTER_VERSION = "1.0.0";
const STORAGE_DIR = path.join(process.cwd(), "uploads", "tax-statements");
const DEFAULT_TIME_ZONE = "America/New_York";
const DISCLAIMER =
  "This report is a technical calculation based on broker data and settings provided by the user. It is not an official tax certificate and does not constitute tax or legal advice. The report should be reviewed by the taxpayer or a qualified German tax adviser before submission.";
const MONEY_SCALE = 10000n;

const EXPECTED_HEADERS = [
  "Opened",
  "Closed",
  "Held",
  "Symbol",
  "Type",
  "Entry",
  "Exit",
  "Qty",
  "Gross",
  "Comm",
  "Ecn Fee",
  "SEC",
  "ORF",
  "CAT",
  "TAF",
  "OCC",
  "NSCC",
  "Acc",
  "Clr",
  "Misc",
  "Net"
];

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function decimalString(value, decimals = 4) {
  const units = typeof value === "bigint" ? value : parseDecimalToScaled(value);
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / MONEY_SCALE;
  const fraction = String(abs % MONEY_SCALE).padStart(4, "0").slice(0, decimals);
  return decimals > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function parseDecimalToScaled(value) {
  if (value === null || value === undefined || value === "") {
    return 0n;
  }

  let text = String(value).trim().replace(/[$,\s]/g, "");
  const negative = /^\(.+\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^-/, "");

  if (!/^\d*(?:\.\d*)?$/.test(text) || text === "" || text === ".") {
    return 0n;
  }

  const [whole = "0", fraction = ""] = text.split(".");
  const scaled = BigInt(whole || "0") * MONEY_SCALE + BigInt((fraction + "0000").slice(0, 4));
  return negative ? -scaled : scaled;
}

function addScaled(...values) {
  return values.reduce((sum, value) => sum + parseDecimalToScaled(value), 0n);
}

function multiplyMoney(quantity, price) {
  return (parseDecimalToScaled(quantity) * parseDecimalToScaled(price)) / MONEY_SCALE;
}

function scaledToNumber(value) {
  return Number(decimalString(value, 4));
}

function parseWorkbookDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?/);

  if (!match) {
    return null;
  }

  const [, month, day, year, hour = "00", minute = "00", second = "00"] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function parseClosedTime(openedDate, value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!openedDate || !match) {
    return null;
  }

  const [, hour, minute, second = "00"] = match;
  return new Date(Date.UTC(
    openedDate.getUTCFullYear(),
    openedDate.getUTCMonth(),
    openedDate.getUTCDate(),
    Number(hour),
    Number(minute),
    Number(second)
  ));
}

function dateOnlyUtc(date) {
  if (!date) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDayKey(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function maskAccount(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  if (text.length <= 4) {
    return text;
  }

  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function isHeaderRow(row) {
  return EXPECTED_HEADERS.every((header, index) => normalizeHeader(row[index]) === header);
}

function isDateSectionRow(row) {
  return Boolean(parseWorkbookDate(row[0])) && row.slice(1).every((cell) => String(cell || "").trim() === "");
}

function parseStatementRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: ""
  });

  const trades = [];
  const totals = [];
  let headers = null;
  let currentDate = null;

  rows.forEach((row, rowIndex) => {
    if (isDateSectionRow(row)) {
      currentDate = dateOnlyUtc(parseWorkbookDate(row[0]));
      return;
    }

    if (isHeaderRow(row)) {
      headers = row.map(normalizeHeader);
      return;
    }

    if (!headers) {
      return;
    }

    const first = normalizeHeader(row[0]);
    if (!first) {
      return;
    }

    const raw = rowToObject(headers, row);

    if (first === "Equities") {
      totals.push({ sourceRow: rowIndex + 1, raw });
      return;
    }

    const openedAt = parseWorkbookDate(raw.Opened);
    if (!openedAt) {
      return;
    }

    const closedAt = parseClosedTime(openedAt, raw.Closed);
    const symbol = normalizeHeader(raw.Symbol).toUpperCase();
    const type = normalizeHeader(raw.Type);
    const quantity = parseDecimalToScaled(raw.Qty);
    const entry = parseDecimalToScaled(raw.Entry);
    const exit = parseDecimalToScaled(raw.Exit);
    const gross = parseDecimalToScaled(raw.Gross);
    const net = parseDecimalToScaled(raw.Net);
    const commission = parseDecimalToScaled(raw.Comm);
    const otherFees = addScaled(raw["Ecn Fee"], raw.SEC, raw.ORF, raw.CAT, raw.TAF, raw.OCC, raw.NSCC, raw.Acc, raw.Clr, raw.Misc);
    const sourceRowHash = sha256(JSON.stringify({ raw, row: rowIndex + 1 }));
    const invalidReasons = [];

    if (!symbol) invalidReasons.push("Stock symbol is missing.");
    if (!quantity || quantity <= 0n) invalidReasons.push("Quantity is invalid.");
    if (!entry || entry <= 0n) invalidReasons.push("Entry price is invalid.");
    if (!exit || exit <= 0n) invalidReasons.push("Exit price is invalid.");
    if (!closedAt) invalidReasons.push("Closed time is missing or invalid.");
    if (type !== "Long") invalidReasons.push(`Unsupported trade type: ${type || "blank"}.`);

    trades.push({
      sourceRow: rowIndex + 1,
      raw,
      sourceRowHash,
      openedAt,
      closedAt,
      tradeDate: dateOnlyUtc(openedAt || currentDate),
      symbol,
      type,
      quantity,
      entry,
      exit,
      gross,
      net,
      commission,
      otherFees,
      invalidReasons
    });
  });

  return {
    sheetName,
    rowCount: rows.length,
    trades,
    totals,
    startDate: trades[0]?.tradeDate || null,
    endDate: trades[trades.length - 1]?.tradeDate || null
  };
}

function buildFingerprint({ brokerAccount, trade }) {
  return sha256([
    brokerAccount || "",
    trade.openedAt?.toISOString() || "",
    trade.closedAt?.toISOString() || "",
    trade.symbol,
    trade.type,
    decimalString(trade.quantity),
    decimalString(trade.entry),
    decimalString(trade.exit),
    decimalString(trade.commission),
    decimalString(trade.otherFees)
  ].join("|"));
}

async function fetchUsdEurRate(dayKey, settings) {
  if (settings?.exchangeRateSource && settings.exchangeRateSource.toLowerCase().includes("manual")) {
    return { rate: null, rateDate: null, source: settings.exchangeRateSource, error: "Manual exchange rate override required." };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/${dayKey}?base=USD&symbols=EUR`);
    if (!response.ok) {
      throw new Error(`FX provider returned ${response.status}`);
    }
    const data = await response.json();
    const rate = Number(data?.rates?.EUR);
    return {
      rate: Number.isFinite(rate) ? rate.toFixed(6) : null,
      rateDate: data?.date || dayKey,
      source: "frankfurter.dev USD/EUR",
      error: Number.isFinite(rate) ? null : "USD/EUR rate was missing."
    };
  } catch (err) {
    return {
      rate: null,
      rateDate: null,
      source: "frankfurter.dev USD/EUR",
      error: err.message
    };
  }
}

async function getSettings(actor) {
  return prisma.taxSetting.upsert({
    where: { userId: actor.id },
    update: {},
    create: {
      userId: actor.id,
      taxpayerName: actor.name || null
    }
  });
}

async function updateSettings(actor, payload) {
  const before = await getSettings(actor);
  const data = {
    taxpayerName: payload.taxpayerName,
    germanTaxYear: payload.germanTaxYear ? Number(payload.germanTaxYear) : undefined,
    brokerName: payload.brokerName,
    brokerAccount: payload.brokerAccount,
    baseCurrency: payload.baseCurrency,
    exchangeRateSource: payload.exchangeRateSource,
    exchangeRateFallbackRule: payload.exchangeRateFallbackRule,
    matchingMethod: payload.matchingMethod,
    reconciliationTolerance: payload.reconciliationTolerance,
    reportLanguage: payload.reportLanguage,
    rounding: payload.rounding,
    taxAdviserNotes: payload.taxAdviserNotes,
    disclaimer: payload.disclaimer
  };
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
  const after = await prisma.taxSetting.update({ where: { userId: actor.id }, data });
  await audit(actor, "TaxSetting", after.id, "UPDATE_SETTINGS", before, after, payload.reason);
  return after;
}

async function audit(actor, entityType, entityId, action, before, after, reason) {
  return prisma.taxAuditLog.create({
    data: {
      userId: actor.id,
      entityType,
      entityId,
      action,
      before: before || undefined,
      after: after || undefined,
      reason: reason || undefined
    }
  });
}

async function persistUploadedFile(file, fileHash) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedPath = path.join(STORAGE_DIR, `${fileHash}-${safeName}`);
  await fs.writeFile(storedPath, file.buffer);
  return storedPath;
}

async function importStatement(actor, file, options = {}) {
  if (!file?.buffer) {
    throw new ApiError(400, "Statement file is required.");
  }

  const settings = await getSettings(actor);
  const fileHash = sha256(file.buffer);
  const parsed = parseStatementRows(file.buffer);
  const brokerAccount = options.brokerAccount || settings.brokerAccount || null;
  const brokerName = options.brokerName || settings.brokerName || "International broker";
  const currency = options.currency || settings.baseCurrency || "USD";
  const storedPath = await persistUploadedFile(file, fileHash);

  const existingFingerprints = new Set(
    (await prisma.taxTransaction.findMany({
      where: { userId: actor.id },
      select: { sourceRowHash: true }
    })).map((row) => row.sourceRowHash)
  );

  let importedTradeCount = 0;
  let duplicateCount = 0;
  let rejectedRowCount = 0;
  let unresolvedRowCount = 0;

  const statement = await prisma.taxStatement.create({
    data: {
      userId: actor.id,
      originalFilename: file.originalname,
      storedPath,
      statementStartDate: parsed.startDate,
      statementEndDate: parsed.endDate,
      brokerName,
      maskedAccountNumber: maskAccount(brokerAccount),
      originalCurrency: currency,
      fileHash,
      importerKey: IMPORTER_KEY,
      importerVersion: IMPORTER_VERSION,
      sourceMetadata: {
        sheetName: parsed.sheetName,
        rowCount: parsed.rowCount,
        observedHeaders: EXPECTED_HEADERS,
        unsupportedFields: ["Broker transaction ID", "ISIN", "Company name", "Currency", "Exchange rate", "Broker account"]
      }
    }
  });

  for (const trade of parsed.trades) {
    const fingerprint = buildFingerprint({ brokerAccount, trade });
    const isDuplicate = existingFingerprints.has(fingerprint);
    const importStatus = trade.invalidReasons.length
      ? "INVALID"
      : isDuplicate
        ? "EXACT_DUPLICATE"
        : "NEW";
    const reviewStatus = trade.invalidReasons.length || !brokerAccount || currency !== "USD"
      ? "NEEDS_REVIEW"
      : "REVIEWED";

    if (importStatus === "EXACT_DUPLICATE") duplicateCount += 1;
    if (importStatus === "INVALID") rejectedRowCount += 1;
    if (reviewStatus === "NEEDS_REVIEW") unresolvedRowCount += 1;

    let rateInfo = { rate: null, rateDate: null, source: settings.exchangeRateSource, error: null };
    if (currency === "USD" && trade.tradeDate) {
      rateInfo = await fetchUsdEurRate(formatDayKey(trade.tradeDate), settings);
    }

    const rateScaled = rateInfo.rate ? parseDecimalToScaled(rateInfo.rate) : 0n;
    const eurGross = rateScaled ? (trade.gross * rateScaled) / MONEY_SCALE : null;
    const eurNet = rateScaled ? (trade.net * rateScaled) / MONEY_SCALE : null;
    const eurFees = rateScaled ? (addScaled(trade.commission, trade.otherFees) * rateScaled) / MONEY_SCALE : null;
    const grossPurchaseValue = multiplyMoney(trade.quantity, trade.entry);
    const grossSaleValue = multiplyMoney(trade.quantity, trade.exit);
    const totalFees = addScaled(trade.commission, trade.otherFees);
    const calculatedNet = trade.gross - totalFees;
    const reconciliationDifference = trade.net - calculatedNet;

    let completedTrade = null;
    if (importStatus === "NEW") {
      completedTrade = await prisma.taxCompletedTrade.create({
        data: {
          userId: actor.id,
          statementId: statement.id,
          brokerAccount: maskAccount(brokerAccount),
          tradeDate: trade.tradeDate,
          stockSymbol: trade.symbol,
          side: "LONG",
          buyQuantity: decimalString(trade.quantity),
          sellQuantity: decimalString(trade.quantity),
          buyPrice: decimalString(trade.entry),
          sellPrice: decimalString(trade.exit),
          grossPurchaseValue: decimalString(grossPurchaseValue),
          grossSaleValue: decimalString(grossSaleValue),
          purchaseFees: decimalString(trade.commission / 2n),
          saleFees: decimalString(totalFees - trade.commission / 2n),
          otherFees: decimalString(trade.otherFees),
          realizedPnlOriginal: decimalString(trade.net),
          exchangeRateToEur: rateInfo.rate || null,
          exchangeRateDate: rateInfo.rateDate ? new Date(`${rateInfo.rateDate}T00:00:00Z`) : null,
          exchangeRateSource: rateInfo.source,
          realizedPnlEur: eurNet === null ? null : decimalString(eurNet),
          brokerReportedPnl: decimalString(trade.net),
          reconciliationDifference: decimalString(reconciliationDifference),
          sourceRow: trade.sourceRow,
          sourceRowHash: fingerprint,
          status: rateInfo.rate ? "MATCHED" : "NEEDS_EXCHANGE_RATE",
          warning: rateInfo.error || (reconciliationDifference !== 0n ? "Broker net differs from formula using visible fees." : null)
        }
      });
      importedTradeCount += 1;
    }

    const transactionBase = {
      userId: actor.id,
      statementId: statement.id,
      sourceRow: trade.sourceRow,
      sourceRowHash: fingerprint,
      brokerAccount: maskAccount(brokerAccount),
      tradeDate: trade.tradeDate,
      timeZone: DEFAULT_TIME_ZONE,
      stockSymbol: trade.symbol || null,
      quantity: decimalString(trade.quantity),
      currency,
      exchangeRateToEur: rateInfo.rate || null,
      exchangeRateDate: rateInfo.rateDate ? new Date(`${rateInfo.rateDate}T00:00:00Z`) : null,
      exchangeRateSource: rateInfo.source,
      exchangeRateFallbackRule: rateInfo.rateDate && rateInfo.rateDate !== formatDayKey(trade.tradeDate) ? settings.exchangeRateFallbackRule : null,
      importStatus,
      duplicateStatus: importStatus === "EXACT_DUPLICATE" ? "EXACT_DUPLICATE" : "NEW",
      reviewStatus,
      invalidReason: trade.invalidReasons.join(" "),
      matchedTradeId: completedTrade?.id || null,
      rawRow: trade.raw
    };

    await prisma.taxTransaction.createMany({
      data: [
        {
          ...transactionBase,
          executionTime: trade.openedAt,
          side: "BUY",
          pricePerShare: decimalString(trade.entry),
          grossAmount: decimalString(-grossPurchaseValue),
          commission: decimalString(trade.commission / 2n),
          otherFees: "0.0000",
          netAmount: decimalString(-grossPurchaseValue - trade.commission / 2n),
          eurGrossAmount: rateScaled ? decimalString((-grossPurchaseValue * rateScaled) / MONEY_SCALE) : null,
          eurFees: rateScaled ? decimalString(((trade.commission / 2n) * rateScaled) / MONEY_SCALE) : null,
          eurNetAmount: rateScaled ? decimalString(((-grossPurchaseValue - trade.commission / 2n) * rateScaled) / MONEY_SCALE) : null,
          realizedPnlOriginal: null,
          realizedPnlEur: null
        },
        {
          ...transactionBase,
          executionTime: trade.closedAt,
          side: "SELL",
          pricePerShare: decimalString(trade.exit),
          grossAmount: decimalString(grossSaleValue),
          commission: decimalString(trade.commission - trade.commission / 2n),
          otherFees: decimalString(trade.otherFees),
          netAmount: decimalString(grossSaleValue - (trade.commission - trade.commission / 2n) - trade.otherFees),
          eurGrossAmount: rateScaled ? decimalString((grossSaleValue * rateScaled) / MONEY_SCALE) : null,
          eurFees: eurFees === null ? null : decimalString(eurFees),
          eurNetAmount: rateScaled ? decimalString(((grossSaleValue - (trade.commission - trade.commission / 2n) - trade.otherFees) * rateScaled) / MONEY_SCALE) : null,
          realizedPnlOriginal: decimalString(trade.net),
          realizedPnlEur: eurNet === null ? null : decimalString(eurNet)
        }
      ]
    });

    existingFingerprints.add(fingerprint);
  }

  const updated = await prisma.taxStatement.update({
    where: { id: statement.id },
    data: {
      importedTradeCount,
      duplicateCount,
      rejectedRowCount,
      unresolvedRowCount,
      importStatus: rejectedRowCount ? "PARTIAL" : "IMPORTED"
    }
  });

  await audit(actor, "TaxStatement", updated.id, "IMPORT_STATEMENT", null, {
    originalFilename: file.originalname,
    importedTradeCount,
    duplicateCount,
    rejectedRowCount,
    unresolvedRowCount
  });

  return updated;
}

function buildPeriodWhere(actor, query = {}) {
  const where = { userId: actor.id };

  if (query.from || query.to) {
    where.tradeDate = {};
    if (query.from) where.tradeDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) where.tradeDate.lte = new Date(`${query.to}T23:59:59Z`);
  }

  if (query.account && query.account !== "all") {
    where.brokerAccount = maskAccount(query.account);
  }

  return where;
}

async function listStatements(actor) {
  return prisma.taxStatement.findMany({
    where: { userId: actor.id },
    orderBy: { uploadedAt: "desc" }
  });
}

async function listTransactions(actor, query = {}) {
  const where = { userId: actor.id };
  if (query.from || query.to) {
    where.tradeDate = {};
    if (query.from) where.tradeDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) where.tradeDate.lte = new Date(`${query.to}T23:59:59Z`);
  }
  if (query.symbol) where.stockSymbol = String(query.symbol).toUpperCase();
  if (query.side) where.side = query.side;
  if (query.importStatus) where.importStatus = query.importStatus;
  if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
  if (query.statementId) where.statementId = query.statementId;

  return prisma.taxTransaction.findMany({
    where,
    include: { statement: { select: { originalFilename: true } } },
    orderBy: [{ tradeDate: "desc" }, { executionTime: "desc" }]
  });
}

async function updateTransaction(actor, id, payload) {
  const before = await prisma.taxTransaction.findFirst({ where: { id, userId: actor.id } });
  if (!before) throw new ApiError(404, "Transaction not found.");

  if (payload.importStatus === "EXCLUDED" && !payload.reason) {
    throw new ApiError(400, "An explanation is required when excluding a row.");
  }
  if (payload.exchangeRateManualOverride && !payload.exchangeRateOverrideReason) {
    throw new ApiError(400, "An override reason is required.");
  }

  const data = {
    stockSymbol: payload.stockSymbol ? String(payload.stockSymbol).toUpperCase() : undefined,
    reviewStatus: payload.reviewStatus,
    userNote: payload.userNote,
    importStatus: payload.importStatus,
    exchangeRateToEur: payload.exchangeRateToEur,
    exchangeRateManualOverride: payload.exchangeRateManualOverride,
    exchangeRateOverrideReason: payload.exchangeRateOverrideReason
  };
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
  const after = await prisma.taxTransaction.update({ where: { id }, data });
  await audit(actor, "TaxTransaction", id, "UPDATE_TRANSACTION", before, after, payload.reason);
  return after;
}

function summarizeCompletedTrades(trades) {
  const totals = {
    completedTrades: trades.length,
    grossProfitEur: 0,
    grossLossEur: 0,
    netRealizedEur: 0,
    commissionsOriginal: 0,
    otherFeesOriginal: 0,
    profitableTrades: 0,
    losingTrades: 0,
    brokerReportedOriginal: 0,
    appCalculatedOriginal: 0,
    reconciliationDifferenceOriginal: 0
  };

  for (const trade of trades) {
    const pnlEur = Number(trade.realizedPnlEur || 0);
    const pnlOriginal = Number(trade.realizedPnlOriginal || 0);
    totals.netRealizedEur += pnlEur;
    totals.appCalculatedOriginal += pnlOriginal;
    totals.brokerReportedOriginal += Number(trade.brokerReportedPnl || 0);
    totals.reconciliationDifferenceOriginal += Number(trade.reconciliationDifference || 0);
    totals.commissionsOriginal += Number(trade.purchaseFees || 0) + Number(trade.saleFees || 0);
    totals.otherFeesOriginal += Number(trade.otherFees || 0);
    if (pnlEur >= 0) {
      totals.grossProfitEur += pnlEur;
      totals.profitableTrades += 1;
    } else {
      totals.grossLossEur += Math.abs(pnlEur);
      totals.losingTrades += 1;
    }
  }

  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [
    key,
    typeof value === "number" ? Number(value.toFixed(2)) : value
  ]));
}

async function buildReportData(actor, query = {}) {
  const settings = await getSettings(actor);
  const completedTrades = await prisma.taxCompletedTrade.findMany({
    where: buildPeriodWhere(actor, query),
    include: { statement: { select: { originalFilename: true, fileHash: true, uploadedAt: true, brokerName: true, maskedAccountNumber: true } } },
    orderBy: [{ tradeDate: "asc" }, { stockSymbol: "asc" }]
  });
  const statements = await prisma.taxStatement.findMany({
    where: { userId: actor.id },
    orderBy: { uploadedAt: "desc" }
  });
  const transactions = await prisma.taxTransaction.findMany({
    where: { ...buildPeriodWhere(actor, query), OR: [{ importStatus: "INVALID" }, { importStatus: "POSSIBLE_DUPLICATE" }, { reviewStatus: "NEEDS_REVIEW" }] },
    orderBy: [{ tradeDate: "asc" }]
  });
  const monthlySummary = new Map();

  for (const trade of completedTrades) {
    const key = trade.tradeDate.toISOString().slice(0, 7);
    const current = monthlySummary.get(key) || { month: key, trades: 0, pnlEur: 0, gainsEur: 0, lossesEur: 0 };
    const pnl = Number(trade.realizedPnlEur || 0);
    current.trades += 1;
    current.pnlEur += pnl;
    if (pnl >= 0) current.gainsEur += pnl;
    else current.lossesEur += Math.abs(pnl);
    monthlySummary.set(key, current);
  }

  const summary = summarizeCompletedTrades(completedTrades);
  const missingExchangeRates = completedTrades.filter((trade) => !trade.exchangeRateToEur).length;
  const possibleDuplicates = await prisma.taxTransaction.count({ where: { userId: actor.id, importStatus: "POSSIBLE_DUPLICATE" } });
  const unmatchedTransactions = await prisma.taxTransaction.count({ where: { userId: actor.id, matchedTradeId: null, importStatus: "NEW" } });
  const reportStatus = missingExchangeRates || possibleDuplicates || unmatchedTransactions || transactions.length ? "BLOCKED" : "READY";

  return {
    settings,
    period: {
      from: query.from || completedTrades[0]?.tradeDate?.toISOString().slice(0, 10) || "",
      to: query.to || completedTrades[completedTrades.length - 1]?.tradeDate?.toISOString().slice(0, 10) || "",
      type: query.periodType || "custom"
    },
    summary: {
      ...summary,
      uploadedStatements: statements.length,
      tradingDays: new Set(completedTrades.map((trade) => trade.tradeDate.toISOString().slice(0, 10))).size,
      unmatchedTransactions,
      possibleDuplicates,
      missingExchangeRates,
      brokerReconciliationDifference: summary.reconciliationDifferenceOriginal,
      reportStatus
    },
    completedTrades,
    statements,
    exceptions: transactions,
    monthlySummary: Array.from(monthlySummary.values()).map((row) => ({
      ...row,
      pnlEur: Number(row.pnlEur.toFixed(2)),
      gainsEur: Number(row.gainsEur.toFixed(2)),
      lossesEur: Number(row.lossesEur.toFixed(2))
    })),
    disclaimer: settings.disclaimer || DISCLAIMER,
    methodology: "For this importer, each source row is a completed long stock round trip. Realized result = sale proceeds - purchase cost - purchase fees - sale fees. Visible statement Gross and Net are stored; Net is used as broker-reported realized P/L. Fees are Comm plus Ecn Fee, SEC, ORF, CAT, TAF, OCC, NSCC, Acc, Clr and Misc."
  };
}

async function getOverview(actor, query = {}) {
  return buildReportData(actor, query);
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const safe = String(value);
  const prefixed = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
  return /[",\n]/.test(prefixed) ? `"${prefixed.replace(/"/g, '""')}"` : prefixed;
}

function buildCsv(rows, columns) {
  return [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(","))
  ].join("\n");
}

async function exportTransactionsCsv(actor, query = {}) {
  const rows = await listTransactions(actor, query);
  const columns = [
    { label: "ID", value: (row) => row.id },
    { label: "Statement", value: (row) => row.statement?.originalFilename },
    { label: "Source row", value: (row) => row.sourceRow },
    { label: "Date", value: (row) => row.tradeDate?.toISOString().slice(0, 10) },
    { label: "Time", value: (row) => row.executionTime?.toISOString() },
    { label: "Symbol", value: (row) => row.stockSymbol },
    { label: "Side", value: (row) => row.side },
    { label: "Quantity", value: (row) => row.quantity },
    { label: "Price", value: (row) => row.pricePerShare },
    { label: "Gross USD", value: (row) => row.grossAmount },
    { label: "Commission USD", value: (row) => row.commission },
    { label: "Other fees USD", value: (row) => row.otherFees },
    { label: "Net USD", value: (row) => row.netAmount },
    { label: "FX rate", value: (row) => row.exchangeRateToEur },
    { label: "EUR net", value: (row) => row.eurNetAmount },
    { label: "Realized P/L USD", value: (row) => row.realizedPnlOriginal },
    { label: "Realized P/L EUR", value: (row) => row.realizedPnlEur },
    { label: "Import status", value: (row) => row.importStatus },
    { label: "Review status", value: (row) => row.reviewStatus },
    { label: "Notes", value: (row) => row.userNote }
  ];
  return buildCsv(rows, columns);
}

async function exportWorkbook(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const transactions = await listTransactions(actor, query);
  const auditLogs = await prisma.taxAuditLog.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "desc" }, take: 500 });
  const workbook = XLSX.utils.book_new();
  const addSheet = (name, rows) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);

  addSheet("Summary", [data.summary]);
  addSheet("Completed trades", data.completedTrades.map((trade) => ({
    date: trade.tradeDate.toISOString().slice(0, 10),
    symbol: trade.stockSymbol,
    buyQuantity: String(trade.buyQuantity),
    buyPrice: String(trade.buyPrice),
    sellQuantity: String(trade.sellQuantity),
    sellPrice: String(trade.sellPrice),
    realizedPnlUsd: String(trade.realizedPnlOriginal),
    exchangeRate: String(trade.exchangeRateToEur || ""),
    realizedPnlEur: String(trade.realizedPnlEur || ""),
    sourceStatement: trade.statement?.originalFilename || ""
  })));
  addSheet("Imported transactions", transactions.map((row) => ({
    id: row.id,
    sourceRow: row.sourceRow,
    date: row.tradeDate?.toISOString().slice(0, 10),
    symbol: row.stockSymbol,
    side: row.side,
    quantity: String(row.quantity || ""),
    price: String(row.pricePerShare || ""),
    net: String(row.netAmount || ""),
    currency: row.currency,
    exchangeRate: String(row.exchangeRateToEur || ""),
    eurNet: String(row.eurNetAmount || ""),
    reviewStatus: row.reviewStatus,
    note: row.userNote || ""
  })));
  addSheet("Exchange rates", data.completedTrades.map((trade) => ({
    date: trade.exchangeRateDate?.toISOString().slice(0, 10),
    currency: "USD",
    source: trade.exchangeRateSource,
    rateToEur: String(trade.exchangeRateToEur || "")
  })));
  addSheet("Statements", data.statements.map((statement) => ({
    filename: statement.originalFilename,
    uploadedAt: statement.uploadedAt.toISOString(),
    start: statement.statementStartDate?.toISOString().slice(0, 10),
    end: statement.statementEndDate?.toISOString().slice(0, 10),
    broker: statement.brokerName,
    account: statement.maskedAccountNumber,
    fileHash: statement.fileHash
  })));
  addSheet("Exceptions", data.exceptions.map((row) => ({
    id: row.id,
    sourceRow: row.sourceRow,
    symbol: row.stockSymbol,
    importStatus: row.importStatus,
    reviewStatus: row.reviewStatus,
    reason: row.invalidReason
  })));
  addSheet("Audit log", auditLogs.map((row) => ({
    createdAt: row.createdAt.toISOString(),
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    reason: row.reason
  })));

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function makePdfText(data, reportId) {
  const lines = [
    "Supporting tax calculation report based on imported broker data",
    `Report ID: ${reportId}`,
    `Generated: ${new Date().toISOString()}`,
    `Taxpayer/report owner: ${data.settings.taxpayerName || ""}`,
    `Broker: ${data.settings.brokerName || ""}`,
    `Broker account: ${data.settings.brokerAccount ? maskAccount(data.settings.brokerAccount) : ""}`,
    `Reporting period: ${data.period.from} to ${data.period.to}`,
    "Original broker currency: USD",
    "Reporting currency: EUR",
    `Currency-conversion method: ${data.settings.exchangeRateSource}; fallback ${data.settings.exchangeRateFallbackRule}`,
    "",
    `Imported statements: ${data.summary.uploadedStatements}`,
    `Completed trades: ${data.summary.completedTrades}`,
    `Profitable trades: ${data.summary.profitableTrades}`,
    `Losing trades: ${data.summary.losingTrades}`,
    `Total realized gains EUR: ${data.summary.grossProfitEur}`,
    `Total realized losses EUR: ${data.summary.grossLossEur}`,
    `Net realized result EUR: ${data.summary.netRealizedEur}`,
    `Commissions USD: ${data.summary.commissionsOriginal}`,
    `Other fees USD: ${data.summary.otherFeesOriginal}`,
    "",
    "Calculation methodology:",
    data.methodology,
    "",
    "Disclaimer:",
    data.disclaimer,
    "",
    "Detailed trade list:",
    ...data.completedTrades.slice(0, 180).map((trade) =>
      `${trade.tradeDate.toISOString().slice(0, 10)} ${trade.stockSymbol} ${trade.buyQuantity}@${trade.buyPrice} -> ${trade.sellQuantity}@${trade.sellPrice} P/L USD ${trade.realizedPnlOriginal} EUR ${trade.realizedPnlEur || ""}`
    )
  ];
  return lines;
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(lines) {
  const pageLines = [];
  for (let i = 0; i < lines.length; i += 42) pageLines.push(lines.slice(i, i + 42));
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const pageIds = [];
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pagesIdPlaceholder = 0;

  for (let pageIndex = 0; pageIndex < pageLines.length; pageIndex += 1) {
    const content = [
      "BT",
      "/F1 10 Tf",
      "50 800 Td",
      ...pageLines[pageIndex].map((line, index) => `${index === 0 ? "" : "0 -16 Td"}(${escapePdfText(line).slice(0, 115)}) Tj`),
      "0 -24 Td",
      `(Page ${pageIndex + 1} of ${pageLines.length}) Tj`,
      "ET"
    ].join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesIdPlaceholder} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace(`${pagesIdPlaceholder} 0 R`, `${pagesId} 0 R`);
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function exportPdf(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const reportId = `TAX-${actor.id.slice(-6).toUpperCase()}-${Date.now()}`;
  return buildSimplePdf(makePdfText(data, reportId));
}

async function finalizeReport(actor, payload = {}) {
  const data = await buildReportData(actor, payload);
  if (data.summary.reportStatus !== "READY") {
    throw new ApiError(400, "Report cannot be finalized while unresolved items remain.");
  }
  const reportId = `TAX-${actor.id.slice(-6).toUpperCase()}-${Date.now()}`;
  const report = await prisma.taxReport.create({
    data: {
      userId: actor.id,
      reportId,
      periodType: payload.periodType || "custom",
      periodStart: new Date(`${data.period.from}T00:00:00Z`),
      periodEnd: new Date(`${data.period.to}T23:59:59Z`),
      brokerAccount: payload.account || null,
      status: "FINALIZED",
      isInterim: payload.periodType !== "year",
      snapshot: data,
      finalizedAt: new Date()
    }
  });
  await audit(actor, "TaxReport", report.id, "FINALIZE_REPORT", null, report);
  return report;
}

async function getSourceFile(actor, statementId) {
  const statement = await prisma.taxStatement.findFirst({ where: { id: statementId, userId: actor.id } });
  if (!statement) throw new ApiError(404, "Statement not found.");
  const buffer = await fs.readFile(statement.storedPath);
  return { statement, buffer };
}

module.exports = {
  IMPORTER_KEY,
  IMPORTER_VERSION,
  DEFAULT_TIME_ZONE,
  DISCLAIMER,
  getSettings,
  updateSettings,
  importStatement,
  listStatements,
  listTransactions,
  updateTransaction,
  getOverview,
  buildReportData,
  exportTransactionsCsv,
  exportWorkbook,
  exportPdf,
  finalizeReport,
  getSourceFile
};
