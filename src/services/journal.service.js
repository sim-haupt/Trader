const prisma = require("../config/prisma");

const fxRateCache = new Map();
const USD_EUR_RATE_SOURCE = "frankfurter.dev";

function normalizeDayKeys(dayKeys) {
  return [...new Set((dayKeys || []).map((dayKey) => String(dayKey || "").trim()).filter(Boolean))];
}

function roundCurrencyCents(value) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(2)) : 0;
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
  return prisma.journalDay.findMany({
    where: {
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id }),
      accountScope: actor.activeAccountScope || "SIMULATOR"
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
  const secFee = payload.secFee === undefined ? undefined : roundCurrencyCents(payload.secFee);
  const finraFee = payload.finraFee === undefined ? undefined : roundCurrencyCents(payload.finraFee);
  const update = {};

  if (notes !== undefined) {
    update.notes = notes;
  }

  if (secFee !== undefined) {
    update.secFee = secFee;
  }

  if (finraFee !== undefined) {
    update.finraFee = finraFee;
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
      secFee: secFee === undefined ? 0 : secFee,
      finraFee: finraFee === undefined ? 0 : finraFee
    },
    update
  });
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
  getUsdEurRates
};
