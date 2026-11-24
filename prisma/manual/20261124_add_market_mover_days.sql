CREATE TABLE "MarketMoverDay" (
  "dayKey" TEXT PRIMARY KEY,
  "metrics" JSONB,
  "collectedAt" TIMESTAMP(3),
  "claimUntil" TIMESTAMP(3),
  "error" TEXT
);
