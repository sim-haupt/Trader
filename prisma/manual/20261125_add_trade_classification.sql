ALTER TABLE "Trade"
ADD COLUMN "additionalSetups" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "Trade_additionalSetups_idx" ON "Trade" USING GIN ("additionalSetups");

CREATE TYPE "EntryGradeSource" AS ENUM ('BLIND', 'MANUAL');

ALTER TABLE "TradeEntryReview"
ADD COLUMN "source" "EntryGradeSource" NOT NULL DEFAULT 'BLIND';
