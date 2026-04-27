DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountScope') THEN
    CREATE TYPE "AccountScope" AS ENUM ('SIMULATOR', 'LIVE');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "activeAccountScope" "AccountScope" NOT NULL DEFAULT 'SIMULATOR',
  ADD COLUMN IF NOT EXISTS "liveDataStartDate" TIMESTAMP(3);

ALTER TABLE "Trade"
  ADD COLUMN IF NOT EXISTS "accountScope" "AccountScope" NOT NULL DEFAULT 'SIMULATOR';

ALTER TABLE "TradeImport"
  ADD COLUMN IF NOT EXISTS "accountScope" "AccountScope" NOT NULL DEFAULT 'SIMULATOR';

ALTER TABLE "JournalDay"
  ADD COLUMN IF NOT EXISTS "accountScope" "AccountScope" NOT NULL DEFAULT 'SIMULATOR';

ALTER TABLE "JournalDay" DROP CONSTRAINT IF EXISTS "JournalDay_userId_dayKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "JournalDay_userId_accountScope_dayKey_key"
  ON "JournalDay"("userId", "accountScope", "dayKey");

CREATE INDEX IF NOT EXISTS "Trade_userId_accountScope_entryDate_idx"
  ON "Trade"("userId", "accountScope", "entryDate");
CREATE INDEX IF NOT EXISTS "Trade_userId_accountScope_symbol_idx"
  ON "Trade"("userId", "accountScope", "symbol");
CREATE INDEX IF NOT EXISTS "Trade_userId_accountScope_strategy_idx"
  ON "Trade"("userId", "accountScope", "strategy");
CREATE INDEX IF NOT EXISTS "TradeImport_userId_accountScope_createdAt_idx"
  ON "TradeImport"("userId", "accountScope", "createdAt");
CREATE INDEX IF NOT EXISTS "JournalDay_userId_accountScope_dayKey_idx"
  ON "JournalDay"("userId", "accountScope", "dayKey");
