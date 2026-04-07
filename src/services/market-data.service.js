const env = require("../config/env");
const ApiError = require("../utils/ApiError");

const POLYGON_BASE_URL = "https://api.polygon.io";

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/^NASDAQ:|^NYSE:|^AMEX:/, "");
}

function toIsoDateTime(value) {
  return new Date(value).toISOString();
}

async function polygonFetch(path, params) {
  if (!env.polygonApiKey) {
    throw new ApiError(
      503,
      "Market data provider is not configured. Add POLYGON_API_KEY to enable review charts."
    );
  }

  const searchParams = new URLSearchParams({
    ...params,
    apiKey: env.polygonApiKey
  });

  const response = await fetch(`${POLYGON_BASE_URL}${path}?${searchParams.toString()}`);

  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(
      response.status,
      `Market data request failed${text ? `: ${text.slice(0, 160)}` : ""}`
    );
  }

  return response.json();
}

function aggregateTradesToBars(results, bucketSizeSeconds) {
  const buckets = new Map();

  for (const trade of results || []) {
    const timestampMs = Math.floor(Number(trade.sip_timestamp || trade.participant_timestamp || trade.timestamp || 0) / 1_000_000);

    if (!timestampMs) {
      continue;
    }

    const bucketStartMs = Math.floor(timestampMs / (bucketSizeSeconds * 1000)) * bucketSizeSeconds * 1000;
    const key = bucketStartMs;
    const price = Number(trade.price);
    const size = Number(trade.size || 0);

    if (!Number.isFinite(price)) {
      continue;
    }

    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, {
        time: Math.floor(bucketStartMs / 1000),
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size
      });
      continue;
    }

    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += size;
  }

  return [...buckets.values()].sort((left, right) => left.time - right.time);
}

async function fetchMinuteBars(symbol, from, to) {
  const data = await polygonFetch(
    `/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/minute/${encodeURIComponent(
      toIsoDateTime(from)
    )}/${encodeURIComponent(toIsoDateTime(to))}`,
    {
      adjusted: "true",
      sort: "asc",
      limit: "50000"
    }
  );

  return (data.results || []).map((bar) => ({
    time: Math.floor(bar.t / 1000),
    open: Number(bar.o),
    high: Number(bar.h),
    low: Number(bar.l),
    close: Number(bar.c),
    volume: Number(bar.v || 0)
  }));
}

async function fetchTenSecondBars(symbol, from, to) {
  const data = await polygonFetch(`/v3/trades/${encodeURIComponent(symbol)}`, {
    "timestamp.gte": toIsoDateTime(from),
    "timestamp.lte": toIsoDateTime(to),
    order: "asc",
    sort: "timestamp",
    limit: "50000"
  });

  return aggregateTradesToBars(data.results || [], 10);
}

async function getBars({ symbol, resolution, from, to, includeExtended }) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const fromDate = new Date(from);
  const toDate = new Date(to);

  let bars;

  if (resolution === "10s") {
    bars = await fetchTenSecondBars(normalizedSymbol, fromDate, toDate);
  } else {
    bars = await fetchMinuteBars(normalizedSymbol, fromDate, toDate);
  }

  return {
    symbol: normalizedSymbol,
    resolution,
    includeExtended,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    bars
  };
}

module.exports = {
  getBars
};
