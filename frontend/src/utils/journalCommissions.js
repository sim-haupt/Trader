export const JOURNAL_COMMISSION_FIELDS = [
  { key: "commissionFee", label: "Comm" },
  { key: "ecnFee", label: "ECN fee" },
  { key: "secFee", label: "SEC" },
  { key: "catFee", label: "CAT" },
  { key: "tafFee", label: "TAF" },
  { key: "nsccFee", label: "NSCC" }
];

function asNumber(value) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function getJournalCommissionValue(day, key) {
  if (key === "tafFee" && day?.tafFee === undefined) {
    return asNumber(day?.finraFee);
  }

  return asNumber(day?.[key]);
}

export function getJournalCommissionTotal(day) {
  return Number(
    JOURNAL_COMMISSION_FIELDS.reduce(
      (total, field) => total + getJournalCommissionValue(day, field.key),
      0
    ).toFixed(2)
  );
}

export function buildJournalCommissionMap(journalDays = []) {
  return new Map(
    journalDays
      .filter((day) => day?.dayKey)
      .map((day) => [day.dayKey, getJournalCommissionTotal(day)])
  );
}
