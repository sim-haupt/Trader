CREATE TABLE "TradeExitPerformance" (
  "tradeId" TEXT NOT NULL REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "mode" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL,
  "metrics" JSONB NOT NULL,
  PRIMARY KEY ("tradeId", "mode")
);
