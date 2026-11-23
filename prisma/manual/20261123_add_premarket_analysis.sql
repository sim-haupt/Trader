BEGIN;

CREATE TABLE "TradeEntryReview" (
  "tradeId" TEXT PRIMARY KEY REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "setupFit" INTEGER NOT NULL CHECK ("setupFit" BETWEEN 0 AND 2),
  "timing" INTEGER NOT NULL CHECK ("timing" BETWEEN 0 AND 2),
  "invalidation" INTEGER NOT NULL CHECK ("invalidation" BETWEEN 0 AND 2),
  "liquidity" INTEGER NOT NULL CHECK ("liquidity" BETWEEN 0 AND 2),
  "wouldRetake" BOOLEAN NOT NULL,
  "notes" TEXT NOT NULL,
  "postRevealNotes" TEXT,
  "plannedStop" DECIMAL(18,4),
  "plannedInitialRisk" DECIMAL(18,4),
  "intendedPrice" DECIMAL(18,4),
  "outcome" JSONB,
  "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PremarketScan" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "symbols" TEXT[] NOT NULL,
  "minDollarVolume" INTEGER NOT NULL,
  "automatic" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "PremarketSnapshot" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "universeKey" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "checkpoint" TEXT NOT NULL,
  "feed" TEXT NOT NULL,
  "cutoff" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metrics" JSONB NOT NULL
);

CREATE UNIQUE INDEX "PremarketSnapshot_scope_checkpoint_key"
  ON "PremarketSnapshot" ("userId", "universeKey", "feed", "dayKey", "checkpoint");
CREATE INDEX "PremarketSnapshot_scope_history_idx"
  ON "PremarketSnapshot" ("userId", "universeKey", "feed", "checkpoint", "dayKey");

COMMIT;
