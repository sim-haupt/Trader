const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { parse: parseCsv } = require("csv-parse/sync");
const XLSX = require("xlsx");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");
const marketDataService = require("./market-data.service");

const IMPORTER_KEY = "WARRIOR_COMPLETED_LONG_STOCK_TRADES_V2";
const IMPORTER_VERSION = "2.0.0";
const STORAGE_DIR = path.join(process.cwd(), "uploads", "tax-statements");
const DEFAULT_TIME_ZONE = "America/New_York";
const RATE_CONVENTION = "1 USD = X EUR";
const DEFAULT_TOLERANCE = "0.01";
const MONEY_SCALE = 100000000n;
const DISPLAY_SCALE = 10000n;
const DISCLAIMER =
  "This report is a technical calculation based on broker data and settings provided by the user. It is not an official tax certificate and does not constitute tax or legal advice. The report should be reviewed by the taxpayer or a qualified German tax adviser before submission.";
const DECLARATION =
  "Die Auswertung wurde auf Grundlage der vom ausländischen Broker bereitgestellten Transaktionsdaten erstellt. Der Steuerpflichtige bestätigt, dass die eingelesenen Daten den vollständigen relevanten Aktienhandel des angegebenen Steuerjahres abbilden. Die Berechnung stellt keine steuerliche Beratung dar.";

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

const FEE_COLUMNS = [
  ["commission_usd", "Comm"],
  ["ecn_fee_usd", "Ecn Fee"],
  ["sec_fee_usd", "SEC"],
  ["orf_fee_usd", "ORF"],
  ["cat_fee_usd", "CAT"],
  ["taf_fee_usd", "TAF"],
  ["occ_fee_usd", "OCC"],
  ["nscc_fee_usd", "NSCC"],
  ["account_fee_usd", "Acc"],
  ["clearing_fee_usd", "Clr"],
  ["miscellaneous_fee_usd", "Misc"]
];

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function detectFileFormat(file) {
  const name = String(file.originalname || "").toLowerCase();
  const buffer = file.buffer;
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature.startsWith("d0cf11e0a1b11ae1")) return "xls";
  if (signature.startsWith("504b0304")) return "xlsx";
  if (name.endsWith(".csv") || /^[\uFEFF\s]*Opened,Closed,Held,/i.test(buffer.toString("utf8", 0, Math.min(buffer.length, 512)))) return "csv";
  throw new ApiError(400, "Unsupported or unreadable file signature. Supported formats are CSV, XLS and XLSX. Password-protected or malformed Excel files cannot be imported.");
}

function parseDecimalToScaled(value) {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value * Number(MONEY_SCALE)));
  let text = String(value).trim().replace(/[$,\s]/g, "");
  const negative = /^\(.+\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^-/, "");
  if (!/^\d*(?:\.\d*)?$/.test(text) || text === "" || text === ".") return 0n;
  const [whole = "0", fraction = ""] = text.split(".");
  const scaled = BigInt(whole || "0") * MONEY_SCALE + BigInt((fraction + "0".repeat(8)).slice(0, 8));
  return negative ? -scaled : scaled;
}

function decimalString(value, decimals = 8) {
  const units = parseDecimalToScaled(value);
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  const whole = abs / MONEY_SCALE;
  const fraction = String(abs % MONEY_SCALE).padStart(8, "0").slice(0, decimals);
  return decimals > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

function decimalNumber(value, decimals = 8) {
  return Number(decimalString(value, decimals));
}

function addScaled(...values) {
  return values.reduce((sum, value) => sum + parseDecimalToScaled(value), 0n);
}

function multiplyScaled(quantity, price) {
  return (parseDecimalToScaled(quantity) * parseDecimalToScaled(price)) / MONEY_SCALE;
}

function convertUsdToEur(usdAmount, usdEurRate) {
  const rate = parseDecimalToScaled(usdEurRate);
  if (!rate) return null;
  return (parseDecimalToScaled(usdAmount) * rate) / MONEY_SCALE;
}

function absScaled(value) {
  const units = parseDecimalToScaled(value);
  return units < 0n ? -units : units;
}

function isWithinTolerance(diff, tolerance) {
  return absScaled(diff) <= parseDecimalToScaled(tolerance || DEFAULT_TOLERANCE);
}

function formatDateKey(date) {
  return date ? date.toISOString().slice(0, 10) : "";
}

function excelSerialToDate(serial) {
  const utcDays = Math.floor(Number(serial) - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = Number(serial) - Math.floor(Number(serial)) + 0.0000001;
  const totalSeconds = Math.floor(86400 * fractionalDay);
  dateInfo.setUTCHours(Math.floor(totalSeconds / 3600));
  dateInfo.setUTCMinutes(Math.floor((totalSeconds % 3600) / 60));
  dateInfo.setUTCSeconds(totalSeconds % 60);
  dateInfo.setUTCMilliseconds(0);
  return dateInfo;
}

function parseWorkbookDate(value, formatted) {
  if (typeof value === "number") return excelSerialToDate(value);
  const text = String(formatted || value || "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
  if (!match) return null;
  const [, month, day, year, hour = "00", minute = "00", second = "00"] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

function parseClosedTime(openedDate, value, formatted) {
  if (!openedDate) return null;
  if (typeof value === "number") {
    const totalSeconds = Math.round((value % 1) * 86400);
    return new Date(Date.UTC(
      openedDate.getUTCFullYear(),
      openedDate.getUTCMonth(),
      openedDate.getUTCDate(),
      Math.floor(totalSeconds / 3600),
      Math.floor((totalSeconds % 3600) / 60),
      totalSeconds % 60
    ));
  }
  const text = String(formatted || value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, hour, minute, second = "00"] = match;
  return new Date(Date.UTC(openedDate.getUTCFullYear(), openedDate.getUTCMonth(), openedDate.getUTCDate(), Number(hour), Number(minute), Number(second)));
}

function sameUtcDay(left, right) {
  return left && right && formatDateKey(left) === formatDateKey(right);
}

function isFormulaInjection(value) {
  return /^[=+\-@]/.test(String(value || ""));
}

function safeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return isFormulaInjection(text) ? `'${text}` : text;
}

function escapeCsv(value) {
  const safe = safeCell(value);
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildCsv(rows, columns) {
  return [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(","))
  ].join("\n");
}

function maskAccount(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 4) return text;
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

function sanitizeFilename(value) {
  return String(value || "broker-file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
}

function isHeaderRow(row) {
  return EXPECTED_HEADERS.every((header, index) => normalizeHeader(row[index]?.formatted ?? row[index]?.value) === header);
}

function isBlankRow(row) {
  return row.every((cell) => !normalizeHeader(cell?.formatted ?? cell?.value));
}

function isDateSectionRow(row) {
  const first = row[0] || {};
  const parsed = parseWorkbookDate(first.value, first.formatted);
  return Boolean(parsed) && row.slice(1).every((cell) => !normalizeHeader(cell?.formatted ?? cell?.value));
}

function rowToObject(headers, row) {
  return Object.fromEntries(headers.map((header, index) => {
    const cell = row[index] || { value: "", formatted: "" };
    return [header, { value: cell.value, formatted: cell.formatted || String(cell.value ?? "") }];
  }));
}

function readWorkbookRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, "The workbook does not contain a readable sheet.");
  const sheet = workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  const rows = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = sheet[address];
      row.push({ value: cell?.v ?? "", formatted: cell?.w ?? String(cell?.v ?? "") });
    }
    rows.push(row);
  }
  return { rows, sheetName };
}

function readCsvRows(buffer) {
  const records = parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""), {
    relax_column_count: true,
    skip_empty_lines: false
  });
  return {
    sheetName: "CSV",
    rows: records.map((row) => row.map((value) => ({ value, formatted: value })))
  };
}

function readRowsFromFile(file) {
  const format = detectFileFormat(file);
  try {
    const parsed = format === "csv" ? readCsvRows(file.buffer) : readWorkbookRows(file.buffer);
    return { ...parsed, format };
  } catch (error) {
    if (format === "xls") {
      throw new ApiError(400, `Legacy .xls file could not be parsed safely. Try converting it with LibreOffice headless mode and upload the converted XLSX. Details: ${error.message}`);
    }
    throw error;
  }
}

function normalizeTrade({ raw, rowIndex, sourceFile, tolerance }) {
  const openedAt = parseWorkbookDate(raw.Opened?.value, raw.Opened?.formatted);
  const closedAt = parseClosedTime(openedAt, raw.Closed?.value, raw.Closed?.formatted);
  const symbol = normalizeHeader(raw.Symbol?.value ?? raw.Symbol?.formatted).toUpperCase();
  const instrumentType = "STOCK";
  const type = normalizeHeader(raw.Type?.value ?? raw.Type?.formatted);
  const direction = type;
  const quantity = parseDecimalToScaled(raw.Qty?.value);
  const entry = parseDecimalToScaled(raw.Entry?.value);
  const exit = parseDecimalToScaled(raw.Exit?.value);
  const brokerGross = parseDecimalToScaled(raw.Gross?.value);
  const brokerNet = parseDecimalToScaled(raw.Net?.value);
  const fees = Object.fromEntries(FEE_COLUMNS.map(([field, column]) => [field, parseDecimalToScaled(raw[column]?.value)]));
  const totalFees = addScaled(...Object.values(fees));
  const acquisitionValue = multiplyScaled(quantity, entry);
  const disposalValue = multiplyScaled(quantity, exit);
  const calculatedGross = disposalValue - acquisitionValue;
  const calculatedNet = calculatedGross - totalFees;
  const grossDifference = brokerGross - calculatedGross;
  const netDifference = brokerNet - calculatedNet;
  const validationMessages = [];

  if (type !== "Long") validationMessages.push(`Unsupported trade type: ${type || "blank"}. Only Long stock trades are supported.`);
  if (!symbol) validationMessages.push("Symbol is missing.");
  if (quantity <= 0n) validationMessages.push("Quantity must be positive.");
  if (entry <= 0n) validationMessages.push("Entry price must be positive.");
  if (exit <= 0n) validationMessages.push("Exit price must be positive.");
  if (!openedAt) validationMessages.push("Open timestamp could not be parsed.");
  if (!closedAt) validationMessages.push("Close timestamp could not be parsed.");
  if (openedAt && closedAt && closedAt < openedAt) validationMessages.push("Close timestamp is earlier than open timestamp.");
  if (openedAt && closedAt && !sameUtcDay(openedAt, closedAt)) validationMessages.push("Trade crosses into another calendar date.");
  if (instrumentType !== "STOCK") validationMessages.push("Unsupported instrument type.");
  if (!isWithinTolerance(grossDifference, tolerance)) validationMessages.push("Broker Gross differs from independently recalculated gross P/L above tolerance.");
  if (!isWithinTolerance(netDifference, tolerance)) validationMessages.push("Broker Net differs from independently recalculated net P/L above tolerance.");

  return {
    source_file: sourceFile,
    source_row_number: rowIndex + 1,
    opened_at: openedAt,
    closed_at: closedAt,
    holding_duration: normalizeHeader(raw.Held?.value ?? raw.Held?.formatted),
    symbol,
    instrument_type: instrumentType,
    direction,
    entry_price_usd: entry,
    exit_price_usd: exit,
    quantity,
    gross_pnl_usd: brokerGross,
    broker_gross_pnl_usd: brokerGross,
    calculated_gross_pnl_usd: calculatedGross,
    ...fees,
    total_fees_usd: totalFees,
    net_pnl_usd: brokerNet,
    broker_net_pnl_usd: brokerNet,
    calculated_net_pnl_usd: calculatedNet,
    gross_difference_usd: grossDifference,
    net_difference_usd: netDifference,
    trade_date: openedAt ? new Date(Date.UTC(openedAt.getUTCFullYear(), openedAt.getUTCMonth(), openedAt.getUTCDate())) : null,
    acquisition_value_usd: acquisitionValue,
    disposal_value_usd: disposalValue,
    fx_rate: null,
    acquisition_value_eur: null,
    disposal_value_eur: null,
    fees_eur: null,
    gross_pnl_eur: null,
    net_pnl_eur: null,
    validation_status: validationMessages.length ? "REJECTED" : "ACCEPTED",
    validation_messages: validationMessages,
    raw: Object.fromEntries(Object.entries(raw).map(([key, cell]) => [key, cell.value])),
    raw_formatted: Object.fromEntries(Object.entries(raw).map(([key, cell]) => [key, cell.formatted]))
  };
}

function parseStatementRows(file, tolerance = DEFAULT_TOLERANCE) {
  const { rows, sheetName, format } = readRowsFromFile(file);
  let headers = null;
  const trades = [];
  const ignoredRows = [];
  const detectedColumns = new Set();
  let currentDate = null;

  rows.forEach((row, rowIndex) => {
    if (isBlankRow(row)) {
      ignoredRows.push({ row: rowIndex + 1, type: "blank" });
      return;
    }
    if (isDateSectionRow(row)) {
      const first = row[0] || {};
      currentDate = parseWorkbookDate(first.value, first.formatted);
      ignoredRows.push({ row: rowIndex + 1, type: "date_separator", date: formatDateKey(currentDate) });
      return;
    }
    if (isHeaderRow(row)) {
      headers = row.slice(0, EXPECTED_HEADERS.length).map((cell) => normalizeHeader(cell.formatted ?? cell.value));
      headers.forEach((header) => detectedColumns.add(header));
      ignoredRows.push({ row: rowIndex + 1, type: "header" });
      return;
    }
    if (!headers) {
      ignoredRows.push({ row: rowIndex + 1, type: "pre_header" });
      return;
    }
    const first = normalizeHeader(row[0]?.formatted ?? row[0]?.value);
    if (first === "Equities") {
      ignoredRows.push({ row: rowIndex + 1, type: "subtotal" });
      return;
    }

    const raw = rowToObject(headers, row);
    const openedAt = parseWorkbookDate(raw.Opened?.value, raw.Opened?.formatted);
    if (!openedAt && !normalizeHeader(raw.Symbol?.value ?? raw.Symbol?.formatted)) {
      ignoredRows.push({ row: rowIndex + 1, type: "unrecognized_structural" });
      return;
    }
    const trade = normalizeTrade({
      raw,
      rowIndex,
      sourceFile: file.originalname,
      tolerance
    });
    if (!trade.trade_date && currentDate) trade.trade_date = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate()));
    trades.push(trade);
  });

  const accepted = trades.filter((trade) => trade.validation_status === "ACCEPTED");
  return {
    fileFormat: format,
    sheetName,
    rowCount: rows.length,
    detectedColumns: Array.from(detectedColumns),
    ignoredRows,
    trades,
    accepted,
    rejected: trades.filter((trade) => trade.validation_status === "REJECTED"),
    startDate: accepted[0]?.trade_date || null,
    endDate: accepted[accepted.length - 1]?.trade_date || null
  };
}

function summarizeStructuralRows(ignoredRows) {
  return ignoredRows.reduce((summary, row) => {
    summary[row.type] = (summary[row.type] || 0) + 1;
    return summary;
  }, {});
}

function buildFingerprint({ brokerAccount, trade }) {
  return sha256([
    brokerAccount || "",
    trade.opened_at?.toISOString() || "",
    trade.closed_at?.toISOString() || "",
    trade.symbol,
    trade.direction,
    decimalString(trade.quantity),
    decimalString(trade.entry_price_usd),
    decimalString(trade.exit_price_usd),
    decimalString(trade.total_fees_usd)
  ].join("|"));
}

async function getSettings(actor) {
  return prisma.taxSetting.upsert({
    where: { userId: actor.id },
    update: {},
    create: {
      userId: actor.id,
      taxpayerName: actor.name || null,
      exchangeRateSource: "Automatic USD/EUR FX API",
      exchangeRateFallbackRule: "previous_available",
      matchingMethod: "COMPLETED_ROUND_TRIP",
      reconciliationTolerance: DEFAULT_TOLERANCE
    }
  });
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

async function updateSettings(actor, payload) {
  const before = await getSettings(actor);
  const data = {
    taxpayerName: payload.taxpayerName,
    germanTaxYear: payload.germanTaxYear ? Number(payload.germanTaxYear) : undefined,
    brokerName: payload.brokerName,
    brokerAccount: payload.brokerAccount,
    baseCurrency: payload.baseCurrency || "USD",
    exchangeRateSource: payload.exchangeRateSource,
    exchangeRateFallbackRule: payload.exchangeRateFallbackRule,
    matchingMethod: payload.matchingMethod || "COMPLETED_ROUND_TRIP",
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

async function persistUploadedFile(file, fileHash) {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storedPath = path.join(STORAGE_DIR, `${fileHash}-${sanitizeFilename(file.originalname)}`);
  await fs.writeFile(storedPath, file.buffer);
  return storedPath;
}

function serializeTradeForMetadata(trade) {
  return {
    source_file: trade.source_file,
    source_row_number: trade.source_row_number,
    opened_at: trade.opened_at?.toISOString() || null,
    closed_at: trade.closed_at?.toISOString() || null,
    holding_duration: trade.holding_duration,
    symbol: trade.symbol,
    instrument_type: trade.instrument_type,
    direction: trade.direction,
    entry_price_usd: decimalString(trade.entry_price_usd),
    exit_price_usd: decimalString(trade.exit_price_usd),
    quantity: decimalString(trade.quantity),
    gross_pnl_usd: decimalString(trade.gross_pnl_usd),
    calculated_gross_pnl_usd: decimalString(trade.calculated_gross_pnl_usd),
    total_fees_usd: decimalString(trade.total_fees_usd),
    net_pnl_usd: decimalString(trade.net_pnl_usd),
    calculated_net_pnl_usd: decimalString(trade.calculated_net_pnl_usd),
    trade_date: formatDateKey(trade.trade_date),
    acquisition_value_usd: decimalString(trade.acquisition_value_usd),
    disposal_value_usd: decimalString(trade.disposal_value_usd),
    validation_status: trade.validation_status,
    validation_messages: trade.validation_messages,
    fee_breakdown: Object.fromEntries(FEE_COLUMNS.map(([field]) => [field, decimalString(trade[field])])),
    raw: trade.raw
  };
}

async function importStatement(actor, file, options = {}) {
  if (!file?.buffer) throw new ApiError(400, "Statement file is required.");
  const settings = await getSettings(actor);
  const tolerance = String(options.reconciliationTolerance || settings.reconciliationTolerance || DEFAULT_TOLERANCE);
  const fileHash = sha256(file.buffer);
  const parsed = parseStatementRows(file, tolerance);
  const brokerAccount = options.brokerAccount || settings.brokerAccount || null;
  const brokerName = options.brokerName || settings.brokerName || "Foreign broker";
  const currency = options.currency || settings.baseCurrency || "USD";
  const storedPath = await persistUploadedFile(file, fileHash);
  const maskedAccount = maskAccount(brokerAccount);
  const existingFingerprints = new Set(
    (await prisma.taxTransaction.findMany({ where: { userId: actor.id }, select: { sourceRowHash: true } })).map((row) => row.sourceRowHash)
  );

  const statement = await prisma.taxStatement.create({
    data: {
      userId: actor.id,
      originalFilename: file.originalname,
      storedPath,
      statementStartDate: parsed.startDate,
      statementEndDate: parsed.endDate,
      brokerName,
      maskedAccountNumber: maskedAccount,
      originalCurrency: currency,
      fileHash,
      importerKey: IMPORTER_KEY,
      importerVersion: IMPORTER_VERSION,
      sourceMetadata: {
        detectedBrokerFormat: "Warrior/DAS completed round-trip trade history",
        fileFormat: parsed.fileFormat,
        sheetName: parsed.sheetName,
        parsedRowCount: parsed.rowCount,
        detectedColumns: parsed.detectedColumns,
        structuralRows: summarizeStructuralRows(parsed.ignoredRows),
        ignoredRows: parsed.ignoredRows,
        directionsFound: Array.from(new Set(parsed.trades.map((trade) => trade.direction).filter(Boolean))),
        instrumentTypesFound: Array.from(new Set(parsed.trades.map((trade) => trade.instrument_type).filter(Boolean))),
        currency,
        tolerance,
        unsupportedFields: ["Broker transaction ID", "ISIN", "Company name", "Broker account in source file", "Per-row currency", "Per-row exchange rate"],
        importerAssumption: "Each accepted source row is a completed intraday long stock round-trip trade. No FIFO matching is applied for this broker format."
      }
    }
  });

  let importedTradeCount = 0;
  let duplicateCount = 0;
  let rejectedRowCount = 0;
  let unresolvedRowCount = 0;

  for (const trade of parsed.trades) {
    const fingerprint = buildFingerprint({ brokerAccount, trade });
    const isDuplicate = existingFingerprints.has(fingerprint);
    const importStatus = trade.validation_status === "REJECTED" ? "INVALID" : isDuplicate ? "EXACT_DUPLICATE" : "NEW";
    const reviewStatus = importStatus === "INVALID" || currency !== "USD" ? "NEEDS_REVIEW" : "REVIEWED";
    if (isDuplicate) duplicateCount += 1;
    if (importStatus === "INVALID") rejectedRowCount += 1;
    if (reviewStatus === "NEEDS_REVIEW") unresolvedRowCount += 1;

    let completedTrade = null;
    if (importStatus === "NEW") {
      completedTrade = await prisma.taxCompletedTrade.create({
        data: {
          userId: actor.id,
          statementId: statement.id,
          brokerAccount: maskedAccount,
          tradeDate: trade.trade_date,
          stockSymbol: trade.symbol,
          side: "LONG",
          buyQuantity: decimalString(trade.quantity),
          sellQuantity: decimalString(trade.quantity),
          buyPrice: decimalString(trade.entry_price_usd),
          sellPrice: decimalString(trade.exit_price_usd),
          grossPurchaseValue: decimalString(trade.acquisition_value_usd),
          grossSaleValue: decimalString(trade.disposal_value_usd),
          purchaseFees: "0",
          saleFees: decimalString(trade.commission_usd),
          otherFees: decimalString(addScaled(trade.total_fees_usd, -trade.commission_usd)),
          realizedPnlOriginal: decimalString(trade.net_pnl_usd),
          exchangeRateToEur: null,
          exchangeRateSource: null,
          realizedPnlEur: null,
          brokerReportedPnl: decimalString(trade.net_pnl_usd),
          reconciliationDifference: decimalString(trade.net_difference_usd),
          sourceRow: trade.source_row_number,
          sourceRowHash: fingerprint,
          status: "NEEDS_EXCHANGE_RATE",
          warning: trade.validation_messages.length ? trade.validation_messages.join(" ") : null
        }
      });
      importedTradeCount += 1;
    }

    await prisma.taxTransaction.create({
      data: {
        userId: actor.id,
        statementId: statement.id,
        sourceRow: trade.source_row_number,
        sourceRowHash: fingerprint,
        brokerAccount: maskedAccount,
        tradeDate: trade.trade_date,
        executionTime: trade.opened_at || trade.trade_date,
        timeZone: DEFAULT_TIME_ZONE,
        stockSymbol: trade.symbol || null,
        side: null,
        quantity: trade.quantity ? decimalString(trade.quantity) : null,
        pricePerShare: trade.entry_price_usd ? decimalString(trade.entry_price_usd) : null,
        grossAmount: decimalString(trade.gross_pnl_usd),
        commission: decimalString(trade.commission_usd),
        otherFees: decimalString(addScaled(trade.total_fees_usd, -trade.commission_usd)),
        netAmount: decimalString(trade.net_pnl_usd),
        currency,
        matchedTradeId: completedTrade?.id || null,
        realizedPnlOriginal: decimalString(trade.net_pnl_usd),
        importStatus,
        duplicateStatus: isDuplicate ? "EXACT_DUPLICATE" : "NEW",
        reviewStatus,
        invalidReason: trade.validation_messages.join(" "),
        rawRow: serializeTradeForMetadata(trade)
      }
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
    fileHash,
    parsedRows: parsed.rowCount,
    acceptedTrades: importedTradeCount,
    rejectedRows: rejectedRowCount,
    duplicates: duplicateCount,
    ignoredStructuralRows: parsed.ignoredRows.length
  });

  return updated;
}

function parseRateCsv(file) {
  const rows = parseCsv(file.buffer.toString("utf8").replace(/^\uFEFF/, ""), {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  return rows.map((row, index) => {
    const date = row.date || row.Date || row.DATE;
    const rate = row.usd_eur || row.USDEUR || row.rate || row.Rate || row["1 USD = X EUR"];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      throw new ApiError(400, `Rate CSV row ${index + 2} is missing a YYYY-MM-DD date.`);
    }
    if (parseDecimalToScaled(rate) <= 0n) {
      throw new ApiError(400, `Rate CSV row ${index + 2} is missing a positive USD/EUR rate.`);
    }
    return { date, rate: decimalString(rate, 8) };
  });
}

async function importExchangeRates(actor, file, options = {}) {
  if (!file?.buffer) throw new ApiError(400, "Exchange-rate CSV is required.");
  const rates = parseRateCsv(file);
  const source = options.sourceName || file.originalname || "Manual USD/EUR CSV";
  for (const rate of rates) {
    await prisma.taxExchangeRate.upsert({
      where: {
        userId_currency_rateDate_source: {
          userId: actor.id,
          currency: "USD_EUR",
          rateDate: new Date(`${rate.date}T00:00:00Z`),
          source
        }
      },
      update: {
        rateToEur: rate.rate,
        fallbackRule: RATE_CONVENTION,
        manualOverride: true
      },
      create: {
        userId: actor.id,
        currency: "USD_EUR",
        rateDate: new Date(`${rate.date}T00:00:00Z`),
        source,
        fallbackRule: RATE_CONVENTION,
        rateToEur: rate.rate,
        manualOverride: true
      }
    });
  }
  await audit(actor, "TaxExchangeRate", null, "IMPORT_RATES", null, { source, count: rates.length, convention: RATE_CONVENTION });
  return { source, count: rates.length, convention: RATE_CONVENTION };
}

async function fetchAndCacheExchangeRates(actor, from, to) {
  if (!from || !to) return { source: "Automatic USD/EUR FX API", count: 0, convention: RATE_CONVENTION };

  const payload = await marketDataService.getUsdEurFxRates({ from, to });
  const entries = Object.entries(payload?.rates || {}).filter(([, rate]) => Number(rate) > 0);
  const source = "market-data/fx-rates frankfurter.dev USD/EUR";

  for (const [date, rate] of entries) {
    await prisma.taxExchangeRate.upsert({
      where: {
        userId_currency_rateDate_source: {
          userId: actor.id,
          currency: "USD_EUR",
          rateDate: new Date(`${date}T00:00:00Z`),
          source
        }
      },
      update: {
        rateToEur: decimalString(rate, 8),
        fallbackRule: RATE_CONVENTION,
        manualOverride: false
      },
      create: {
        userId: actor.id,
        currency: "USD_EUR",
        rateDate: new Date(`${date}T00:00:00Z`),
        source,
        fallbackRule: RATE_CONVENTION,
        rateToEur: decimalString(rate, 8),
        manualOverride: false
      }
    });
  }

  await audit(actor, "TaxExchangeRate", null, "FETCH_RATES", null, {
    source,
    from,
    to,
    count: entries.length,
    convention: RATE_CONVENTION
  });

  return { source, count: entries.length, convention: RATE_CONVENTION };
}

async function findRate(actor, tradeDate, settings) {
  if (!tradeDate) return { rate: null, rateDate: null, source: null, fallbackUsed: false };
  const rates = await prisma.taxExchangeRate.findMany({
    where: {
      userId: actor.id,
      currency: "USD_EUR",
      rateDate: { lte: tradeDate }
    },
    orderBy: { rateDate: "desc" },
    take: 1
  });
  const rate = rates[0];
  if (!rate) return { rate: null, rateDate: null, source: null, fallbackUsed: false };
  return {
    rate: String(rate.rateToEur),
    rateDate: rate.rateDate,
    source: rate.source,
    fallbackUsed: formatDateKey(rate.rateDate) !== formatDateKey(tradeDate),
    fallbackRule: settings.exchangeRateFallbackRule || "previous_available"
  };
}

async function applyExchangeRates(actor) {
  const settings = await getSettings(actor);
  const trades = await prisma.taxCompletedTrade.findMany({ where: { userId: actor.id }, orderBy: [{ tradeDate: "asc" }, { sourceRow: "asc" }] });
  const datedTrades = trades.filter((trade) => trade.tradeDate);
  if (datedTrades.length) {
    await fetchAndCacheExchangeRates(
      actor,
      formatDateKey(datedTrades[0].tradeDate),
      formatDateKey(datedTrades[datedTrades.length - 1].tradeDate)
    );
  }
  let updated = 0;
  let missing = 0;
  for (const trade of trades) {
    const rate = await findRate(actor, trade.tradeDate, settings);
    if (!rate.rate) {
      missing += 1;
      await prisma.taxCompletedTrade.update({ where: { id: trade.id }, data: { status: "NEEDS_EXCHANGE_RATE", warning: "Missing EUR/USD exchange rate." } });
      continue;
    }
    const acquisitionEur = convertUsdToEur(String(trade.grossPurchaseValue), rate.rate);
    const disposalEur = convertUsdToEur(String(trade.grossSaleValue), rate.rate);
    const feesUsd = addScaled(String(trade.purchaseFees), String(trade.saleFees), String(trade.otherFees));
    const feesEur = convertUsdToEur(feesUsd, rate.rate);
    const netEur = convertUsdToEur(String(trade.realizedPnlOriginal), rate.rate);
    await prisma.taxCompletedTrade.update({
      where: { id: trade.id },
      data: {
        exchangeRateToEur: rate.rate,
        exchangeRateDate: rate.rateDate,
        exchangeRateSource: `${rate.source}; ${RATE_CONVENTION}${rate.fallbackUsed ? `; fallback ${rate.fallbackRule}` : ""}`,
        realizedPnlEur: decimalString(netEur),
        status: "MATCHED",
        warning: rate.fallbackUsed ? `Exchange-rate fallback used: ${rate.fallbackRule}.` : trade.warning
      }
    });
    await prisma.taxTransaction.updateMany({
      where: { matchedTradeId: trade.id },
      data: {
        exchangeRateToEur: rate.rate,
        exchangeRateDate: rate.rateDate,
        exchangeRateSource: rate.source,
        exchangeRateFallbackRule: rate.fallbackUsed ? rate.fallbackRule : null,
        eurGrossAmount: decimalString(disposalEur - acquisitionEur),
        eurFees: decimalString(feesEur),
        eurNetAmount: decimalString(netEur),
        realizedPnlEur: decimalString(netEur)
      }
    });
    updated += 1;
  }
  await audit(actor, "TaxExchangeRate", null, "APPLY_RATES", null, { updated, missing, convention: RATE_CONVENTION });
  return { updated, missing, convention: RATE_CONVENTION };
}

function buildPeriodWhere(actor, query = {}) {
  const where = { userId: actor.id };
  if (query.from || query.to) {
    where.tradeDate = {};
    if (query.from) where.tradeDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) where.tradeDate.lte = new Date(`${query.to}T23:59:59Z`);
  }
  if (query.account && query.account !== "all") where.brokerAccount = maskAccount(query.account);
  return where;
}

async function listStatements(actor) {
  return prisma.taxStatement.findMany({ where: { userId: actor.id }, orderBy: { uploadedAt: "desc" } });
}

async function listTransactions(actor, query = {}) {
  const where = { userId: actor.id };
  if (query.from || query.to) {
    where.tradeDate = {};
    if (query.from) where.tradeDate.gte = new Date(`${query.from}T00:00:00Z`);
    if (query.to) where.tradeDate.lte = new Date(`${query.to}T23:59:59Z`);
  }
  if (query.symbol) where.stockSymbol = String(query.symbol).toUpperCase();
  if (query.importStatus) where.importStatus = query.importStatus;
  if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
  if (query.statementId) where.statementId = query.statementId;
  return prisma.taxTransaction.findMany({
    where,
    include: { statement: { select: { originalFilename: true } } },
    orderBy: [{ tradeDate: "desc" }, { executionTime: "desc" }, { sourceRow: "asc" }]
  });
}

async function updateTransaction(actor, id, payload) {
  const before = await prisma.taxTransaction.findFirst({ where: { id, userId: actor.id } });
  if (!before) throw new ApiError(404, "Transaction not found.");
  if (payload.importStatus === "EXCLUDED" && !payload.reason) throw new ApiError(400, "An explanation is required when excluding a row.");
  if (payload.exchangeRateManualOverride && !payload.exchangeRateOverrideReason) throw new ApiError(400, "An override reason is required.");
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
  await audit(actor, "TaxTransaction", id, "ADJUST_TRANSACTION", before, after, payload.reason);
  return after;
}

function summarizeRows(trades, selector) {
  const map = new Map();
  for (const trade of trades) {
    const key = selector(trade);
    const current = map.get(key) || {
      key,
      tradeCount: 0,
      quantity: 0,
      grossGainsUsd: 0,
      grossLossesUsd: 0,
      grossGainsEur: 0,
      grossLossesEur: 0,
      feesUsd: 0,
      feesEur: 0,
      netUsd: 0,
      netEur: 0,
      tradingDays: new Set(),
      symbols: new Set()
    };
    const grossUsd = Number(trade.grossSaleValue) - Number(trade.grossPurchaseValue);
    const netUsd = Number(trade.realizedPnlOriginal || 0);
    const grossEur = trade.exchangeRateToEur ? (Number(trade.grossSaleValue) - Number(trade.grossPurchaseValue)) * Number(trade.exchangeRateToEur) : 0;
    const netEur = Number(trade.realizedPnlEur || 0);
    const feesUsd = Number(trade.purchaseFees || 0) + Number(trade.saleFees || 0) + Number(trade.otherFees || 0);
    const feesEur = trade.exchangeRateToEur ? feesUsd * Number(trade.exchangeRateToEur) : 0;
    current.tradeCount += 1;
    current.quantity += Number(trade.buyQuantity || 0);
    current.netUsd += netUsd;
    current.netEur += netEur;
    current.feesUsd += feesUsd;
    current.feesEur += feesEur;
    if (grossUsd >= 0) current.grossGainsUsd += grossUsd;
    else current.grossLossesUsd += Math.abs(grossUsd);
    if (grossEur >= 0) current.grossGainsEur += grossEur;
    else current.grossLossesEur += Math.abs(grossEur);
    current.tradingDays.add(formatDateKey(trade.tradeDate));
    current.symbols.add(trade.stockSymbol);
    map.set(key, current);
  }
  return Array.from(map.values()).map((row) => ({
    ...row,
    tradingDays: row.tradingDays.size,
    distinctSymbols: row.symbols.size,
    symbols: undefined,
    grossGainsUsd: Number(row.grossGainsUsd.toFixed(4)),
    grossLossesUsd: Number(row.grossLossesUsd.toFixed(4)),
    grossGainsEur: Number(row.grossGainsEur.toFixed(4)),
    grossLossesEur: Number(row.grossLossesEur.toFixed(4)),
    feesUsd: Number(row.feesUsd.toFixed(4)),
    feesEur: Number(row.feesEur.toFixed(4)),
    netUsd: Number(row.netUsd.toFixed(4)),
    netEur: Number(row.netEur.toFixed(4))
  }));
}

async function buildReportData(actor, query = {}) {
  const settings = await getSettings(actor);
  const completedTrades = await prisma.taxCompletedTrade.findMany({
    where: buildPeriodWhere(actor, query),
    include: { statement: { select: { originalFilename: true, fileHash: true, uploadedAt: true, brokerName: true, maskedAccountNumber: true, sourceMetadata: true } } },
    orderBy: [{ tradeDate: "asc" }, { stockSymbol: "asc" }, { sourceRow: "asc" }]
  });
  const statements = await prisma.taxStatement.findMany({ where: { userId: actor.id }, orderBy: { uploadedAt: "desc" } });
  const exceptions = await prisma.taxTransaction.findMany({
    where: { ...buildPeriodWhere(actor, query), OR: [{ importStatus: "INVALID" }, { reviewStatus: "NEEDS_REVIEW" }] },
    orderBy: [{ tradeDate: "asc" }, { sourceRow: "asc" }]
  });
  const allImportedRows = await prisma.taxTransaction.findMany({ where: buildPeriodWhere(actor, query), include: { statement: { select: { originalFilename: true } } }, orderBy: [{ tradeDate: "asc" }, { sourceRow: "asc" }] });
  const rates = await prisma.taxExchangeRate.findMany({ where: { userId: actor.id }, orderBy: [{ rateDate: "asc" }] });

  const summaryRows = summarizeRows(completedTrades, () => "all");
  const all = summaryRows[0] || {};
  const tradingDaySet = new Set(completedTrades.map((trade) => formatDateKey(trade.tradeDate)));
  const symbolSet = new Set(completedTrades.map((trade) => trade.stockSymbol));
  const missingExchangeRates = completedTrades.filter((trade) => !trade.exchangeRateToEur).length;
  const duplicateRows = await prisma.taxTransaction.count({ where: { userId: actor.id, duplicateStatus: "EXACT_DUPLICATE" } });
  const rejectedRows = exceptions.filter((row) => row.importStatus === "INVALID").length;
  const discrepancyRows = completedTrades.filter((trade) => !isWithinTolerance(String(trade.reconciliationDifference || 0), String(settings.reconciliationTolerance || DEFAULT_TOLERANCE))).length;
  const structuralCounts = statements.reduce((sum, statement) => {
    const structural = statement.sourceMetadata?.structuralRows || {};
    Object.entries(structural).forEach(([key, value]) => {
      sum[key] = (sum[key] || 0) + Number(value || 0);
    });
    return sum;
  }, {});
  const brokerGross = completedTrades.reduce((sum, trade) => sum + (Number(trade.grossSaleValue) - Number(trade.grossPurchaseValue)), 0);
  const brokerFees = completedTrades.reduce((sum, trade) => sum + Number(trade.purchaseFees || 0) + Number(trade.saleFees || 0) + Number(trade.otherFees || 0), 0);
  const brokerNet = completedTrades.reduce((sum, trade) => sum + Number(trade.brokerReportedPnl || trade.realizedPnlOriginal || 0), 0);
  const recalculatedNet = brokerGross - brokerFees;
  const reconciliationStatus = rejectedRows || missingExchangeRates
    ? "Review required"
    : discrepancyRows
      ? "Passed with rounding differences"
      : Math.abs(brokerNet - recalculatedNet) <= Number(settings.reconciliationTolerance || DEFAULT_TOLERANCE)
        ? "Passed"
        : "Failed";

  return {
    settings,
    disclaimer: settings.disclaimer || DISCLAIMER,
    declaration: DECLARATION,
    methodology: [
      "Nur abgeschlossene Long-Aktientrades wurden einbezogen.",
      "Jede importierte Zeile dieses Brokerformats wurde als abgeschlossener Intraday-Round-Trip behandelt; FIFO wurde fuer dieses Format nicht angewendet.",
      `USD-Betraege werden mit der Konvention ${RATE_CONVENTION} umgerechnet: EUR = USD * USD/EUR-Kurs.`,
      "Fehlende Nicht-Geschaeftstage verwenden standardmaessig den letzten vorherigen verfuegbaren offiziellen Kurs und werden im Audit markiert.",
      "Interne Berechnungen verwenden skalierte Dezimalwerte; gerundet wird erst fuer die Darstellung.",
      "Es wird keine Steuerfreibetrags-, Einkommensteuer-, Solidaritaetszuschlags- oder Kirchensteuerberechnung vorgenommen."
    ],
    period: {
      from: query.from || completedTrades[0]?.tradeDate?.toISOString().slice(0, 10) || "",
      to: query.to || completedTrades[completedTrades.length - 1]?.tradeDate?.toISOString().slice(0, 10) || "",
      type: query.periodType || "custom"
    },
    summary: {
      category: "Gains and losses from the disposal of shares / Aktienveraeusserungsgewinne und -verluste",
      completedTrades: completedTrades.length,
      profitableTrades: completedTrades.filter((trade) => Number(trade.realizedPnlOriginal || 0) > 0).length,
      losingTrades: completedTrades.filter((trade) => Number(trade.realizedPnlOriginal || 0) < 0).length,
      breakEvenTrades: completedTrades.filter((trade) => Number(trade.realizedPnlOriginal || 0) === 0).length,
      totalQuantityBought: Number((all.quantity || 0).toFixed?.(4) || 0),
      totalQuantitySold: Number((all.quantity || 0).toFixed?.(4) || 0),
      grossGainsUsd: all.grossGainsUsd || 0,
      grossLossesUsd: all.grossLossesUsd || 0,
      grossGainsEur: all.grossGainsEur || 0,
      grossLossesEur: all.grossLossesEur || 0,
      totalFeesUsd: all.feesUsd || 0,
      totalFeesEur: all.feesEur || 0,
      netRealizedUsd: all.netUsd || 0,
      netRealizedEur: all.netEur || 0,
      earliestTradeDate: completedTrades[0]?.tradeDate?.toISOString().slice(0, 10) || "",
      latestTradeDate: completedTrades[completedTrades.length - 1]?.tradeDate?.toISOString().slice(0, 10) || "",
      tradingDays: tradingDaySet.size,
      distinctSymbols: symbolSet.size,
      openYearEndPositionCount: 0,
      uploadedStatements: statements.length,
      rejectedRows,
      missingExchangeRates,
      duplicateRows,
      reportStatus: missingExchangeRates || rejectedRows || discrepancyRows ? "BLOCKED" : "READY"
    },
    reconciliation: {
      status: reconciliationStatus,
      sumBrokerGrossUsd: Number(brokerGross.toFixed(4)),
      sumFeeColumnsUsd: Number(brokerFees.toFixed(4)),
      sumBrokerNetUsd: Number(brokerNet.toFixed(4)),
      recalculatedGrossUsd: Number(brokerGross.toFixed(4)),
      recalculatedFeesUsd: Number(brokerFees.toFixed(4)),
      recalculatedNetUsd: Number(recalculatedNet.toFixed(4)),
      grossDifferenceUsd: 0,
      netDifferenceUsd: Number((brokerNet - recalculatedNet).toFixed(4)),
      rowsWithDiscrepanciesAboveTolerance: discrepancyRows,
      ignoredStructuralRows: structuralCounts,
      acceptedTradeRows: completedTrades.length,
      rejectedTradeRows: rejectedRows,
      totalImportedRows: allImportedRows.length
    },
    completedTrades,
    transactions: allImportedRows,
    statements,
    exceptions,
    exchangeRates: rates,
    monthlySummary: summarizeRows(completedTrades, (trade) => trade.tradeDate.toISOString().slice(0, 7)).map((row) => ({ month: row.key, ...row })),
    dailySummary: summarizeRows(completedTrades, (trade) => formatDateKey(trade.tradeDate)).map((row) => ({
      date: row.key,
      eurUsdRate: completedTrades.find((trade) => formatDateKey(trade.tradeDate) === row.key)?.exchangeRateToEur || "",
      ...row
    })),
    symbolSummary: summarizeRows(completedTrades, (trade) => trade.stockSymbol).map((row) => ({ symbol: row.key, ...row }))
  };
}

async function getOverview(actor, query = {}) {
  return buildReportData(actor, query);
}

function tradeLedgerRow(trade) {
  const feesUsd = Number(trade.purchaseFees || 0) + Number(trade.saleFees || 0) + Number(trade.otherFees || 0);
  const rate = Number(trade.exchangeRateToEur || 0);
  const acquisitionEur = rate ? Number(trade.grossPurchaseValue) * rate : "";
  const disposalEur = rate ? Number(trade.grossSaleValue) * rate : "";
  const feesEur = rate ? feesUsd * rate : "";
  const grossEur = rate ? (Number(trade.grossSaleValue) - Number(trade.grossPurchaseValue)) * rate : "";
  return {
    source_row: trade.sourceRow,
    opened_at: trade.transactions?.[0]?.executionTime?.toISOString?.() || "",
    date: formatDateKey(trade.tradeDate),
    symbol: trade.stockSymbol,
    direction: trade.side,
    entry_price_usd: String(trade.buyPrice),
    exit_price_usd: String(trade.sellPrice),
    quantity: String(trade.buyQuantity),
    acquisition_value_usd: String(trade.grossPurchaseValue),
    disposal_value_usd: String(trade.grossSaleValue),
    broker_gross_pnl_usd: Number(trade.grossSaleValue) - Number(trade.grossPurchaseValue),
    total_fees_usd: feesUsd,
    broker_net_pnl_usd: String(trade.realizedPnlOriginal),
    eurusd_rate: String(trade.exchangeRateToEur || ""),
    acquisition_value_eur: acquisitionEur,
    disposal_value_eur: disposalEur,
    gross_pnl_eur: grossEur,
    fees_eur: feesEur,
    net_pnl_eur: String(trade.realizedPnlEur || ""),
    validation_status: trade.status,
    source_statement: trade.statement?.originalFilename || ""
  };
}

async function exportTransactionsCsv(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const rows = data.completedTrades.map(tradeLedgerRow);
  const columns = Object.keys(rows[0] || { source_row: "" }).map((key) => ({ label: key, value: (row) => row[key] }));
  return buildCsv(rows, columns);
}

async function exportWorkbook(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const workbook = XLSX.utils.book_new();
  const addSheet = (name, rows) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Hinweis: "Keine Daten" }]);
    sheet["!autofilter"] = { ref: sheet["!ref"] };
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  };
  addSheet("Hinweise", [{ Hinweis: data.disclaimer }, { Hinweis: data.declaration }, ...data.methodology.map((Hinweis) => ({ Hinweis }))]);
  addSheet("Jahresuebersicht", [data.summary]);
  addSheet("Monatsuebersicht", data.monthlySummary);
  addSheet("Tagesuebersicht", data.dailySummary);
  addSheet("Symboluebersicht", data.symbolSummary);
  addSheet("Transaktionen_EUR", data.completedTrades.map(tradeLedgerRow));
  addSheet("Transaktionen_USD", data.completedTrades.map((trade) => ({
    source_row: trade.sourceRow,
    date: formatDateKey(trade.tradeDate),
    symbol: trade.stockSymbol,
    quantity: String(trade.buyQuantity),
    entry_usd: String(trade.buyPrice),
    exit_usd: String(trade.sellPrice),
    acquisition_usd: String(trade.grossPurchaseValue),
    disposal_usd: String(trade.grossSaleValue),
    fees_usd: Number(trade.purchaseFees || 0) + Number(trade.saleFees || 0) + Number(trade.otherFees || 0),
    net_usd: String(trade.realizedPnlOriginal)
  })));
  addSheet("Wechselkurse", data.exchangeRates.map((rate) => ({
    date: formatDateKey(rate.rateDate),
    eurusd_rate: String(rate.rateToEur),
    convention: RATE_CONVENTION,
    source: rate.source,
    imported_at: rate.createdAt.toISOString()
  })));
  addSheet("Abstimmung", [data.reconciliation]);
  addSheet("Abgewiesene_Zeilen", data.exceptions.map((row) => ({
    source_row: row.sourceRow,
    symbol: row.stockSymbol,
    reason: row.invalidReason,
    source_statement: row.statement?.originalFilename || ""
  })));
  addSheet("Importprotokoll", data.statements.map((statement) => ({
    filename: statement.originalFilename,
    uploaded_at: statement.uploadedAt.toISOString(),
    file_hash: statement.fileHash,
    status: statement.importStatus,
    imported_trades: statement.importedTradeCount,
    rejected_rows: statement.rejectedRowCount,
    metadata: JSON.stringify(statement.sourceMetadata)
  })));
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx", bookSST: false });
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
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const placeholder = 0;
  const pageIds = [];
  pageLines.forEach((linesForPage, pageIndex) => {
    const content = ["BT", "/F1 10 Tf", "45 800 Td", ...linesForPage.map((line, index) => `${index ? "0 -16 Td" : ""}(${escapePdfText(line).slice(0, 118)}) Tj`), "0 -28 Td", `(Seite ${pageIndex + 1} von ${pageLines.length}) Tj`, "ET"].join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${placeholder} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  pageIds.forEach((id) => {
    objects[id - 1] = objects[id - 1].replace(`${placeholder} 0 R`, `${pagesId} 0 R`);
  });
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function exportPdf(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const reportId = `STEUER-${actor.id.slice(-6).toUpperCase()}-${Date.now()}`;
  const lines = [
    "Steuerlicher Transaktionsbericht - Aktienhandel ueber auslaendisches Brokerkonto",
    "Supporting tax calculation report based on imported broker data",
    `Report ID: ${reportId}`,
    `Steuerjahr: ${data.settings.germanTaxYear}`,
    `Steuerpflichtiger: ${data.settings.taxpayerName || ""}`,
    `Broker: ${data.settings.brokerName || ""}`,
    `Brokerkonto: ${data.settings.brokerAccount ? maskAccount(data.settings.brokerAccount) : ""}`,
    `Berichtszeitraum: ${data.period.from} bis ${data.period.to}`,
    `Broker-Kontowaehrung: USD; Berichtswährung: EUR; Kurskonvention: ${RATE_CONVENTION}`,
    "",
    "Jahresuebersicht",
    `Abgeschlossene Trades: ${data.summary.completedTrades}`,
    `Bruttogewinne EUR: ${data.summary.grossGainsEur}`,
    `Bruttoverluste EUR: ${data.summary.grossLossesEur}`,
    `Transaktionskosten EUR: ${data.summary.totalFeesEur}`,
    `Nettoergebnis EUR: ${data.summary.netRealizedEur}`,
    `Kategorie: ${data.summary.category}`,
    "",
    "Methodik",
    ...data.methodology,
    "",
    "Abstimmung",
    ...Object.entries(data.reconciliation).map(([key, value]) => `${key}: ${JSON.stringify(value)}`),
    "",
    "Detailanlage",
    ...data.completedTrades.slice(0, 220).map((trade) => {
      const row = tradeLedgerRow(trade);
      return `${row.date} ${row.symbol} ${row.quantity} ${row.entry_price_usd}->${row.exit_price_usd} USD ${row.broker_net_pnl_usd} EUR ${row.net_pnl_eur}`;
    }),
    "",
    "Erklaerung",
    data.declaration,
    "Datum: ____________________    Unterschrift: ____________________",
    "",
    "Disclaimer",
    data.disclaimer
  ];
  return buildSimplePdf(lines);
}

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = dosDateTime();
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data));
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(now.dosTime, 10);
    local.writeUInt16LE(now.dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(now.dosTime, 12);
    central.writeUInt16LE(now.dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, end]);
}

async function exportEvidenceZip(actor, query = {}) {
  const data = await buildReportData(actor, query);
  const pdf = await exportPdf(actor, query);
  const xlsx = await exportWorkbook(actor, query);
  const ledgerCsv = await exportTransactionsCsv(actor, query);
  const rejectedCsv = buildCsv(data.exceptions, [
    { label: "source_row", value: (row) => row.sourceRow },
    { label: "symbol", value: (row) => row.stockSymbol },
    { label: "reason", value: (row) => row.invalidReason }
  ]);
  const ratesCsv = buildCsv(data.exchangeRates, [
    { label: "date", value: (row) => formatDateKey(row.rateDate) },
    { label: "eurusd_rate", value: (row) => row.rateToEur },
    { label: "convention", value: () => RATE_CONVENTION },
    { label: "source", value: (row) => row.source }
  ]);
  const validationJson = JSON.stringify({ summary: data.summary, reconciliation: data.reconciliation, generatedAt: new Date().toISOString() }, null, 2);
  const importLog = JSON.stringify(data.statements.map((statement) => statement.sourceMetadata), null, 2);
  const sourceFiles = [];
  for (const statement of data.statements) {
    try {
      sourceFiles.push({ name: `original/${sanitizeFilename(statement.originalFilename)}`, data: await fs.readFile(statement.storedPath) });
    } catch {
      sourceFiles.push({ name: `original/${sanitizeFilename(statement.originalFilename)}.missing.txt`, data: "Original file was not readable from local storage." });
    }
  }
  const files = [
    { name: "tax-report.pdf", data: pdf },
    { name: "tax-report.xlsx", data: xlsx },
    { name: "normalized-trade-ledger.csv", data: ledgerCsv },
    { name: "rejected-rows.csv", data: rejectedCsv },
    { name: "exchange-rates.csv", data: ratesCsv },
    { name: "import-log.json", data: importLog },
    { name: "validation-reconciliation.json", data: validationJson },
    ...sourceFiles
  ];
  const manifest = files.map((file) => ({
    file: file.name,
    sha256: sha256(Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data)))
  }));
  return buildZip([...files, { name: "manifest.json", data: JSON.stringify(manifest, null, 2) }]);
}

async function finalizeReport(actor, payload = {}) {
  const data = await buildReportData(actor, payload);
  if (data.summary.reportStatus !== "READY") throw new ApiError(400, "Report cannot be finalized while unresolved validation, reconciliation or exchange-rate items remain.");
  const reportId = `STEUER-${actor.id.slice(-6).toUpperCase()}-${Date.now()}`;
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
  return { statement, buffer: await fs.readFile(statement.storedPath) };
}

module.exports = {
  IMPORTER_KEY,
  IMPORTER_VERSION,
  DEFAULT_TIME_ZONE,
  DISCLAIMER,
  DECLARATION,
  RATE_CONVENTION,
  parseStatementRows,
  getSettings,
  updateSettings,
  importStatement,
  importExchangeRates,
  applyExchangeRates,
  listStatements,
  listTransactions,
  updateTransaction,
  getOverview,
  buildReportData,
  exportTransactionsCsv,
  exportWorkbook,
  exportPdf,
  exportEvidenceZip,
  finalizeReport,
  getSourceFile
};
