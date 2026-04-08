function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function normalizeRichTextHtml(value) {
  const stringValue = String(value || "").trim();

  if (!stringValue) {
    return "";
  }

  if (/<[a-z][\s\S]*>/i.test(stringValue)) {
    return stringValue;
  }

  return stringValue
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function isRichTextEmpty(value) {
  const html = normalizeRichTextHtml(value)
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();

  return !html;
}
