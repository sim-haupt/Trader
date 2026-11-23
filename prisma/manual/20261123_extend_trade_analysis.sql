BEGIN;
CREATE TABLE "TradeAnalysis" (
  "tradeId" TEXT PRIMARY KEY REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "intendedExit" DECIMAL(18,4),
  "stopExecutionId" TEXT,
  "snapshot" JSONB,
  "execution" JSONB,
  "collectedAt" TIMESTAMP(3)
);
INSERT INTO "TradeAnalysis" ("tradeId", "execution")
SELECT "tradeId", "outcome" FROM "TradeEntryReview"
WHERE "outcome" IS NOT NULL AND "outcome" <> 'null'::jsonb
ON CONFLICT ("tradeId") DO NOTHING;

UPDATE "TradeEntryReview" AS review
SET "outcome" = NULL
FROM "TradeAnalysis" AS analysis
WHERE review."tradeId" = analysis."tradeId" AND review."outcome" = analysis."execution";
COMMIT;
