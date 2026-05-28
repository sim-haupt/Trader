ALTER TABLE "User"
  ALTER COLUMN "defaultCommission" SET DEFAULT 0.0006;

UPDATE "User"
SET "defaultCommission" = 0.0006
WHERE "defaultCommission" = 0;
