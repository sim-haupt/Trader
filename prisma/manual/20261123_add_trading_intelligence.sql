BEGIN;

CREATE TABLE "IntelligenceProfile" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountScope" "AccountScope" NOT NULL,
  "settings" JSONB NOT NULL,
  "nextRunAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3),
  PRIMARY KEY ("userId", "accountScope")
);
CREATE INDEX "IntelligenceProfile_nextRunAt_idx" ON "IntelligenceProfile" ("nextRunAt");

CREATE TABLE "IntelligenceReport" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountScope" "AccountScope" NOT NULL,
  "reportKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fromDay" TEXT NOT NULL,
  "toDay" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "IntelligenceReport_userId_accountScope_reportKey_key" ON "IntelligenceReport" ("userId", "accountScope", "reportKey");
CREATE INDEX "IntelligenceReport_userId_accountScope_createdAt_idx" ON "IntelligenceReport" ("userId", "accountScope", "createdAt");

CREATE TABLE "IntelligenceDismissal" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountScope" "AccountScope" NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "accountScope", "fingerprint")
);
CREATE INDEX "IntelligenceDismissal_userId_accountScope_createdAt_idx" ON "IntelligenceDismissal" ("userId", "accountScope", "createdAt");

CREATE TABLE "IntelligenceGoal" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accountScope" "AccountScope" NOT NULL,
  "title" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "target" DOUBLE PRECISION NOT NULL,
  "settings" JSONB NOT NULL,
  "startsOn" TEXT NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IntelligenceGoal_userId_accountScope_archivedAt_idx" ON "IntelligenceGoal" ("userId", "accountScope", "archivedAt");
CREATE TABLE "IntelligenceGoalObservation" (
  "goalId" TEXT NOT NULL REFERENCES "IntelligenceGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dayKey" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "sampleCount" INTEGER NOT NULL,
  PRIMARY KEY ("goalId", "dayKey")
);

CREATE TABLE "IntelligenceUsage" (
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "dayKey" TEXT NOT NULL,
  "calls" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("userId", "dayKey")
);

COMMIT;
