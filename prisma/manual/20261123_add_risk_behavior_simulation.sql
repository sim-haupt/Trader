BEGIN;

ALTER TABLE "TradeAnalysis"
  ADD COLUMN "behavior" JSONB,
  ADD COLUMN "replayNotes" TEXT;

CREATE TABLE "RiskProfile" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountScope" "AccountScope" NOT NULL,
  "settings" JSONB NOT NULL,
  "simulation" JSONB,
  PRIMARY KEY ("userId", "accountScope")
);

COMMIT;
