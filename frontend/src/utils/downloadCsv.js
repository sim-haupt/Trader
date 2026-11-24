function csvValue(value, protectFormulas) {
  let stringValue = value === undefined || value === null ? "" : String(value);

  if (protectFormulas && typeof value === "string" && /^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@])/.test(stringValue)) stringValue = `'${stringValue}`;
  if (/["\r\n,]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export default function downloadCsv(filename, rows, { protectFormulas = false } = {}) {
  const csv = rows.map((row) => row.map((value) => csvValue(value, protectFormulas)).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
