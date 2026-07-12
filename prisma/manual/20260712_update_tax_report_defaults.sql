ALTER TABLE "TaxSetting"
  ALTER COLUMN "exchangeRateSource" SET DEFAULT 'Automatic USD/EUR FX API',
  ALTER COLUMN "matchingMethod" SET DEFAULT 'COMPLETED_ROUND_TRIP',
  ALTER COLUMN "reconciliationTolerance" SET DEFAULT 0.01;

UPDATE "TaxSetting"
SET "exchangeRateSource" = 'Automatic USD/EUR FX API',
    "matchingMethod" = CASE
      WHEN "matchingMethod" = 'FIFO' THEN 'COMPLETED_ROUND_TRIP'
      ELSE "matchingMethod"
    END,
    "updatedAt" = NOW()
WHERE "exchangeRateSource" IN ('Manual ECB EUR/USD CSV', 'Manual EUR/USD CSV', 'frankfurter.dev USD/EUR')
   OR "matchingMethod" = 'FIFO';
