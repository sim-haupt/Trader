DO $$ BEGIN
  CREATE TYPE "TaxImportStatus" AS ENUM ('NEW', 'EXACT_DUPLICATE', 'POSSIBLE_DUPLICATE', 'INVALID', 'EXCLUDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxReviewStatus" AS ENUM ('NEEDS_REVIEW', 'REVIEWED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxTransactionSide" AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "TaxReportStatus" AS ENUM ('DRAFT', 'FINALIZED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "TaxStatement" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "originalFilename" TEXT NOT NULL,
  "storedPath" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "statementStartDate" TIMESTAMP(3),
  "statementEndDate" TIMESTAMP(3),
  "brokerName" TEXT,
  "maskedAccountNumber" TEXT,
  "originalCurrency" TEXT NOT NULL DEFAULT 'USD',
  "fileHash" TEXT NOT NULL,
  "importerKey" TEXT NOT NULL,
  "importerVersion" TEXT NOT NULL,
  "importStatus" TEXT NOT NULL DEFAULT 'IMPORTED',
  "importedTradeCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "rejectedRowCount" INTEGER NOT NULL DEFAULT 0,
  "unresolvedRowCount" INTEGER NOT NULL DEFAULT 0,
  "sourceMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TaxCompletedTrade" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "statementId" TEXT REFERENCES "TaxStatement"("id") ON DELETE SET NULL,
  "brokerAccount" TEXT,
  "tradeDate" TIMESTAMP(3) NOT NULL,
  "stockSymbol" TEXT NOT NULL,
  "side" TEXT NOT NULL DEFAULT 'LONG',
  "buyQuantity" NUMERIC(24,8) NOT NULL,
  "sellQuantity" NUMERIC(24,8) NOT NULL,
  "buyPrice" NUMERIC(24,8) NOT NULL,
  "sellPrice" NUMERIC(24,8) NOT NULL,
  "grossPurchaseValue" NUMERIC(24,8) NOT NULL,
  "grossSaleValue" NUMERIC(24,8) NOT NULL,
  "purchaseFees" NUMERIC(24,8) NOT NULL DEFAULT 0,
  "saleFees" NUMERIC(24,8) NOT NULL DEFAULT 0,
  "otherFees" NUMERIC(24,8) NOT NULL DEFAULT 0,
  "realizedPnlOriginal" NUMERIC(24,8) NOT NULL,
  "exchangeRateToEur" NUMERIC(24,10),
  "exchangeRateDate" TIMESTAMP(3),
  "exchangeRateSource" TEXT,
  "realizedPnlEur" NUMERIC(24,8),
  "brokerReportedPnl" NUMERIC(24,8),
  "reconciliationDifference" NUMERIC(24,8),
  "sourceRow" INTEGER,
  "sourceRowHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'MATCHED',
  "warning" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TaxTransaction" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "statementId" TEXT NOT NULL REFERENCES "TaxStatement"("id") ON DELETE CASCADE,
  "sourceRow" INTEGER NOT NULL,
  "sourceRowHash" TEXT NOT NULL,
  "brokerTransactionId" TEXT,
  "brokerAccount" TEXT,
  "tradeDate" TIMESTAMP(3),
  "executionTime" TIMESTAMP(3),
  "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
  "stockSymbol" TEXT,
  "isin" TEXT,
  "companyName" TEXT,
  "side" "TaxTransactionSide",
  "quantity" NUMERIC(24,8),
  "pricePerShare" NUMERIC(24,8),
  "grossAmount" NUMERIC(24,8),
  "commission" NUMERIC(24,8) NOT NULL DEFAULT 0,
  "otherFees" NUMERIC(24,8) NOT NULL DEFAULT 0,
  "netAmount" NUMERIC(24,8),
  "currency" TEXT,
  "exchangeRateToEur" NUMERIC(24,10),
  "exchangeRateDate" TIMESTAMP(3),
  "exchangeRateSource" TEXT,
  "exchangeRateFallbackRule" TEXT,
  "exchangeRateManualOverride" BOOLEAN NOT NULL DEFAULT false,
  "exchangeRateOverrideReason" TEXT,
  "eurGrossAmount" NUMERIC(24,8),
  "eurFees" NUMERIC(24,8),
  "eurNetAmount" NUMERIC(24,8),
  "matchedTradeId" TEXT REFERENCES "TaxCompletedTrade"("id") ON DELETE SET NULL,
  "realizedPnlOriginal" NUMERIC(24,8),
  "realizedPnlEur" NUMERIC(24,8),
  "importStatus" "TaxImportStatus" NOT NULL DEFAULT 'NEW',
  "duplicateStatus" TEXT NOT NULL DEFAULT 'NEW',
  "reviewStatus" "TaxReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "userNote" TEXT,
  "invalidReason" TEXT,
  "rawRow" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TaxExchangeRate" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "currency" TEXT NOT NULL,
  "rateDate" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL,
  "fallbackRule" TEXT,
  "rateToEur" NUMERIC(24,10) NOT NULL,
  "manualOverride" BOOLEAN NOT NULL DEFAULT false,
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "currency", "rateDate", "source")
);

CREATE TABLE IF NOT EXISTS "TaxSetting" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "taxpayerName" TEXT,
  "germanTaxYear" INTEGER NOT NULL DEFAULT 2026,
  "brokerName" TEXT NOT NULL DEFAULT 'International broker',
  "brokerAccount" TEXT,
  "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
  "exchangeRateSource" TEXT NOT NULL DEFAULT 'frankfurter.dev USD/EUR',
  "exchangeRateFallbackRule" TEXT NOT NULL DEFAULT 'previous_available',
  "matchingMethod" TEXT NOT NULL DEFAULT 'FIFO',
  "reconciliationTolerance" NUMERIC(18,4) NOT NULL DEFAULT 1.00,
  "reportLanguage" TEXT NOT NULL DEFAULT 'de',
  "rounding" TEXT NOT NULL DEFAULT '2_decimals',
  "taxAdviserNotes" TEXT,
  "disclaimer" TEXT NOT NULL DEFAULT 'This report is a technical calculation based on broker data and settings provided by the user. It is not an official tax certificate and does not constitute tax or legal advice. The report should be reviewed by the taxpayer or a qualified German tax adviser before submission.',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TaxReport" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "reportId" TEXT NOT NULL UNIQUE,
  "periodType" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "brokerAccount" TEXT,
  "status" "TaxReportStatus" NOT NULL DEFAULT 'DRAFT',
  "isInterim" BOOLEAN NOT NULL DEFAULT true,
  "snapshot" JSONB NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TaxAuditLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "TaxStatement_userId_statementStartDate_idx" ON "TaxStatement"("userId", "statementStartDate");
CREATE INDEX IF NOT EXISTS "TaxStatement_userId_fileHash_idx" ON "TaxStatement"("userId", "fileHash");
CREATE INDEX IF NOT EXISTS "TaxTransaction_userId_tradeDate_idx" ON "TaxTransaction"("userId", "tradeDate");
CREATE INDEX IF NOT EXISTS "TaxTransaction_userId_stockSymbol_idx" ON "TaxTransaction"("userId", "stockSymbol");
CREATE INDEX IF NOT EXISTS "TaxTransaction_userId_sourceRowHash_idx" ON "TaxTransaction"("userId", "sourceRowHash");
CREATE INDEX IF NOT EXISTS "TaxCompletedTrade_userId_tradeDate_idx" ON "TaxCompletedTrade"("userId", "tradeDate");
CREATE INDEX IF NOT EXISTS "TaxCompletedTrade_userId_stockSymbol_idx" ON "TaxCompletedTrade"("userId", "stockSymbol");
CREATE INDEX IF NOT EXISTS "TaxCompletedTrade_userId_sourceRowHash_idx" ON "TaxCompletedTrade"("userId", "sourceRowHash");
CREATE INDEX IF NOT EXISTS "TaxExchangeRate_userId_rateDate_idx" ON "TaxExchangeRate"("userId", "rateDate");
CREATE INDEX IF NOT EXISTS "TaxReport_userId_periodStart_periodEnd_idx" ON "TaxReport"("userId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "TaxAuditLog_userId_createdAt_idx" ON "TaxAuditLog"("userId", "createdAt");
