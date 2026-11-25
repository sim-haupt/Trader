BEGIN;

ALTER TABLE "TradeEntryReview" ADD COLUMN "letterGrade" TEXT;

UPDATE "TradeEntryReview"
SET "letterGrade" = CASE
  WHEN "setupFit" + "timing" + "invalidation" + "liquidity" >= 8 THEN 'A+'
  WHEN "setupFit" + "timing" + "invalidation" + "liquidity" = 7 THEN 'A'
  WHEN "setupFit" + "timing" + "invalidation" + "liquidity" >= 4 THEN 'B'
  ELSE 'C'
END;

ALTER TABLE "TradeEntryReview"
  ALTER COLUMN "letterGrade" SET NOT NULL,
  ADD CONSTRAINT "TradeEntryReview_letterGrade_check" CHECK ("letterGrade" IN ('A+', 'A', 'B', 'C')),
  ALTER COLUMN "setupFit" DROP NOT NULL,
  ALTER COLUMN "timing" DROP NOT NULL,
  ALTER COLUMN "invalidation" DROP NOT NULL,
  ALTER COLUMN "liquidity" DROP NOT NULL,
  ALTER COLUMN "wouldRetake" DROP NOT NULL,
  ALTER COLUMN "notes" SET DEFAULT '';

COMMIT;
