const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const taxReports = require("../src/services/tax-report.service");

const fixturePath = process.argv[2] || "/Users/szy/Downloads/21924-2026-06-01-to-2026-06-29-trades.xls";

function dec(value) {
  const units = typeof value === "bigint" ? value : BigInt(value);
  const sign = units < 0n ? "-" : "";
  const abs = units < 0n ? -units : units;
  return Number(`${sign}${abs / 100000000n}.${String(abs % 100000000n).padStart(8, "0")}`);
}

function summarize(parsed) {
  return parsed.accepted.reduce((summary, trade) => {
    summary.quantity += dec(trade.quantity);
    summary.gross += dec(trade.gross_pnl_usd);
    summary.fees += dec(trade.total_fees_usd);
    summary.net += dec(trade.net_pnl_usd);
    summary.symbols.add(trade.symbol);
    return summary;
  }, { quantity: 0, gross: 0, fees: 0, net: 0, symbols: new Set() });
}

function assertClose(actual, expected, tolerance = 0.00001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function workbookToCsvBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const lines = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const values = [];
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      const value = columnIndex <= 2 ? (cell?.w ?? cell?.v ?? "") : (cell?.v ?? "");
      values.push(String(value).includes(",") ? `"${String(value).replace(/"/g, '""')}"` : String(value));
    }
    lines.push(values.join(","));
  }

  return Buffer.from(lines.join("\n"));
}

function runFixtureAssertions(file) {
  const parsed = taxReports.parseStatementRows(file, "0.01");
  const totals = summarize(parsed);
  const ignored = parsed.ignoredRows.reduce((counts, row) => {
    counts[row.type] = (counts[row.type] || 0) + 1;
    return counts;
  }, {});

  assert.strictEqual(parsed.accepted.length, 86);
  assert.strictEqual(parsed.rejected.length, 0);
  assert.strictEqual(ignored.date_separator, 13);
  assert.strictEqual(ignored.header, 13);
  assert.strictEqual(ignored.subtotal, 13);
  assert.strictEqual(ignored.blank, 12);
  assert.strictEqual(totals.symbols.size, 33);
  assertClose(totals.quantity, 3080);
  assertClose(totals.gross, -201.405);
  assertClose(totals.fees, 30.7797);
  assertClose(totals.net, -232.1847);
  assert.strictEqual(parsed.accepted.every((trade) => trade.direction === "Long"), true);
  assert.strictEqual(parsed.accepted.every((trade) => trade.validation_status === "ACCEPTED"), true);
  assert.strictEqual(parsed.accepted.every((trade) => trade.trade_date && trade.opened_at && trade.closed_at), true);
  return { parsed, totals, ignored };
}

const xlsBuffer = fs.readFileSync(fixturePath);
const xlsResult = runFixtureAssertions({
  originalname: path.basename(fixturePath),
  buffer: xlsBuffer
});

const csvResult = runFixtureAssertions({
  originalname: "equivalent.csv",
  buffer: workbookToCsvBuffer(xlsBuffer)
});

assert.strictEqual(xlsResult.parsed.fileFormat, "xls");
assert.strictEqual(csvResult.parsed.fileFormat, "csv");

console.log(JSON.stringify({
  ok: true,
  xls: {
    accepted: xlsResult.parsed.accepted.length,
    ignored: xlsResult.ignored,
    distinctSymbols: xlsResult.totals.symbols.size,
    quantity: xlsResult.totals.quantity,
    gross: Number(xlsResult.totals.gross.toFixed(4)),
    fees: Number(xlsResult.totals.fees.toFixed(4)),
    net: Number(xlsResult.totals.net.toFixed(4))
  },
  csv: {
    accepted: csvResult.parsed.accepted.length,
    distinctSymbols: csvResult.totals.symbols.size
  }
}, null, 2));
