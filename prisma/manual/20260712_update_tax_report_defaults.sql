ALTER TABLE "TaxSetting"
  ALTER COLUMN "exchangeRateSource" SET DEFAULT 'Manual ECB EUR/USD CSV',
  ALTER COLUMN "matchingMethod" SET DEFAULT 'COMPLETED_ROUND_TRIP',
  ALTER COLUMN "reconciliationTolerance" SET DEFAULT 0.01;
