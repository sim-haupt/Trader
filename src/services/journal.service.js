const prisma = require("../config/prisma");
const XLSX = require("xlsx");

const fxRateCache = new Map();
const USD_EUR_RATE_SOURCE = "frankfurter.dev";

function normalizeDayKeys(dayKeys) {
  return [...new Set((dayKeys || []).map((dayKey) => String(dayKey || "").trim()).filter(Boolean))];
}

function getLiveDataStartDayKey(actor) {
  if ((actor.activeAccountScope || "SIMULATOR") !== "LIVE" || !actor.liveDataStartDate) {
    return null;
  }

  return actor.liveDataStartDate instanceof Date
    ? actor.liveDataStartDate.toISOString().slice(0, 10)
    : String(actor.liveDataStartDate).slice(0, 10);
}

function roundCurrencyMillis(value) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(3)) : 0;
}

const JOURNAL_FEE_FIELDS = [
  "commissionFee",
  "ecnFee",
  "secFee",
  "catFee",
  "tafFee",
  "nsccFee",
  "finraFee"
];

const COMMISSION_COLUMN_MAP = {
  Comm: "commissionFee",
  "Ecn Fee": "ecnFee",
  "ECN Fee": "ecnFee",
  SEC: "secFee",
  CAT: "catFee",
  TAF: "tafFee",
  NSCC: "nsccFee"
};

function parseMoney(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalizedValue = String(value).trim().replace(/[$,]/g, "");
  const isNegative = /^\(.+\)$/.test(normalizedValue);
  const numericValue = Number(normalizedValue.replace(/[()]/g, ""));

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return isNegative ? -numericValue : numericValue;
}

function parseWorkbookDateKey(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const stringValue = String(value).trim();
  const match = stringValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);

  if (!match) {
    return "";
  }

  const [, month, day, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeHeader(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function extractCommissionBreakdownRows(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const importedDays = [];

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false
    });
    let header = [];
    let currentDayKey = "";

    for (const row of rows) {
      const firstCell = normalizeHeader(row[0]);
      const rowDayKey = parseWorkbookDateKey(row[0]);

      if (rowDayKey) {
        currentDayKey = rowDayKey;
      }

      if (row.some((cell) => normalizeHeader(cell) === "Opened")) {
        header = row.map(normalizeHeader);
        continue;
      }

      if (firstCell.toLowerCase() !== "equities" || !currentDayKey || header.length === 0) {
        continue;
      }

      const values = {};

      for (const [columnName, fieldName] of Object.entries(COMMISSION_COLUMN_MAP)) {
        const columnIndex = header.findIndex(
          (headerName) => headerName.toLowerCase() === columnName.toLowerCase()
        );
        values[fieldName] = columnIndex >= 0 ? roundCurrencyMillis(parseMoney(row[columnIndex])) : 0;
      }

      importedDays.push({
        dayKey: currentDayKey,
        ...values
      });
    }
  }

  return importedDays;
}

async function fetchUsdEurRate(dayKey) {
  const cached = fxRateCache.get(dayKey);

  if (cached) {
    return cached;
  }

  if (typeof fetch !== "function") {
    return {
      dayKey,
      rateDate: null,
      rate: null,
      source: USD_EUR_RATE_SOURCE,
      error: "FX rate lookup is unavailable in this runtime."
    };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/${dayKey}?base=USD&symbols=EUR`);

    if (!response.ok) {
      throw new Error(`FX provider returned ${response.status}`);
    }

    const data = await response.json();
    const rate = Number(data?.rates?.EUR);
    const result = {
      dayKey,
      rateDate: data?.date || dayKey,
      rate: Number.isFinite(rate) ? Number(rate.toFixed(6)) : null,
      source: USD_EUR_RATE_SOURCE,
      error: Number.isFinite(rate) ? null : "USD/EUR rate was missing."
    };

    fxRateCache.set(dayKey, result);
    return result;
  } catch (err) {
    return {
      dayKey,
      rateDate: null,
      rate: null,
      source: USD_EUR_RATE_SOURCE,
      error: err.message
    };
  }
}

async function listJournalDays(actor) {
  const liveDataStartDayKey = getLiveDataStartDayKey(actor);

  return prisma.journalDay.findMany({
    where: {
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id }),
      accountScope: actor.activeAccountScope || "SIMULATOR",
      ...(liveDataStartDayKey ? { dayKey: { gte: liveDataStartDayKey } } : {})
    },
    orderBy: { dayKey: "desc" }
  });
}

async function updateJournalDay(actor, dayKey, payload) {
  const notes =
    payload.notes === undefined
      ? undefined
      : payload.notes === null || payload.notes === ""
        ? null
        : String(payload.notes);
  const update = {};

  if (notes !== undefined) {
    update.notes = notes;
  }

  for (const field of JOURNAL_FEE_FIELDS) {
    if (payload[field] !== undefined) {
      update[field] = roundCurrencyMillis(payload[field]);
    }
  }

  return prisma.journalDay.upsert({
    where: {
      userId_accountScope_dayKey: {
        userId: actor.id,
        accountScope: actor.activeAccountScope || "SIMULATOR",
        dayKey
      }
    },
    create: {
      userId: actor.id,
      accountScope: actor.activeAccountScope || "SIMULATOR",
      dayKey,
      notes: notes === undefined ? null : notes,
      commissionFee: update.commissionFee ?? 0,
      ecnFee: update.ecnFee ?? 0,
      secFee: update.secFee ?? 0,
      catFee: update.catFee ?? 0,
      tafFee: update.tafFee ?? update.finraFee ?? 0,
      nsccFee: update.nsccFee ?? 0,
      finraFee: update.finraFee ?? update.tafFee ?? 0
    },
    update
  });
}

async function importJournalCommissions(actor, file) {
  const importedDays = extractCommissionBreakdownRows(file.buffer);

  if (importedDays.length === 0) {
    return [];
  }

  const accountScope = actor.activeAccountScope || "SIMULATOR";
  const savedDays = [];

  for (const day of importedDays) {
    const savedDay = await updateJournalDay(actor, day.dayKey, {
      commissionFee: day.commissionFee,
      ecnFee: day.ecnFee,
      secFee: day.secFee,
      catFee: day.catFee,
      tafFee: day.tafFee,
      nsccFee: day.nsccFee,
      finraFee: day.tafFee
    });

    savedDays.push(savedDay);
  }

  return savedDays.filter((day) => day.accountScope === accountScope);
}

async function getUsdEurRates(dayKeys) {
  const normalizedDayKeys = normalizeDayKeys(dayKeys);
  const rates = await Promise.all(normalizedDayKeys.map((dayKey) => fetchUsdEurRate(dayKey)));

  return rates.reduce((result, rate) => {
    result[rate.dayKey] = rate;
    return result;
  }, {});
}

module.exports = {
  listJournalDays,
  updateJournalDay,
  importJournalCommissions,
  getUsdEurRates
};
