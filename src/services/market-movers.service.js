const prisma = require("../config/prisma");
const { archiveSession } = require("../utils/marketMovers");

const PAGE_SIZE = 30;

async function readArchive(through) {
  const records = await prisma.marketMoverDay.findMany({
    where: { collectedAt: { not: null }, ...(through && { dayKey: { lte: through } }) },
    orderBy: { dayKey: "desc" },
    select: { dayKey: true, metrics: true },
    take: PAGE_SIZE + 1
  });
  return {
    rows: records.slice(0, PAGE_SIZE).map(({ dayKey, metrics }) => ({
      day: dayKey,
      premarket: archiveSession(metrics?.premarket),
      wholeDay: archiveSession(metrics?.wholeDay)
    })),
    nextThrough: records[PAGE_SIZE]?.dayKey ?? null
  };
}

async function importArchive(days) {
  const recordedAt = new Date();
  for (const [day, metrics] of days) {
    await prisma.$executeRaw`
      INSERT INTO "MarketMoverDay" ("dayKey", "metrics", "collectedAt")
      VALUES (${day}, ${JSON.stringify(metrics)}::jsonb, ${recordedAt})
      ON CONFLICT ("dayKey") DO UPDATE
      SET "metrics" = COALESCE("MarketMoverDay"."metrics", '{}'::jsonb) || EXCLUDED."metrics",
          "collectedAt" = EXCLUDED."collectedAt",
          "claimUntil" = NULL,
          "error" = NULL
    `;
  }
}

module.exports = { readArchive, importArchive };
