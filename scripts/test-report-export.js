const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildCsv, buildSimplePdf } = require("../src/utils/reportExport");

test("exports genuine numeric cells and neutralizes user-authored spreadsheet formulas", () => {
  const result = buildCsv([[-15, "  =SUM(A1)"], [-2, 'Quote,"example"']],
    [{ label: "Net", value: (row) => row[0] }, { label: "Setup", value: (row) => row[1] }], { allowNumbers: true });
  assert.match(result, /^Net,Setup\n-15,'  =SUM\(A1\)/);
  assert.match(result, /-2,"Quote,""example"""/);
  const pdf = buildSimplePdf(["Report", "(entry)"], "Page");
  assert.equal(pdf.toString().slice(0, 8), "%PDF-1.4");
  assert(pdf.toString().includes("Page 1 of 1"));
});
