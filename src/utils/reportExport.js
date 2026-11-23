function isFormulaInjection(value) {
  return /^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@])/.test(String(value || ""));
}

function safeCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return isFormulaInjection(text) ? `'${text}` : text;
}

function escapeCsv(value) {
  const safe = safeCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function buildCsv(rows, columns, { allowNumbers = false } = {}) {
  return [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => {
      const value = column.value(row);
      return allowNumbers && Number.isFinite(value) ? String(value) : escapeCsv(value);
    }).join(","))
  ].join("\n");
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(lines, pageLabel = "Seite") {
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
    const content = ["BT", "/F1 10 Tf", "45 800 Td", ...linesForPage.map((line, index) => `${index ? "0 -16 Td" : ""}(${escapePdfText(line).slice(0, 118)}) Tj`), "0 -28 Td", `(${escapePdfText(pageLabel)} ${pageIndex + 1} ${pageLabel === "Seite" ? "von" : "of"} ${pageLines.length}) Tj`, "ET"].join("\n");
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

module.exports = { safeCell, buildCsv, buildSimplePdf };
