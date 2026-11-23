const prisma = require("../src/config/prisma");
const { CHECKPOINTS, getScan, capture } = require("../src/services/premarket.service");
const { marketDayKey, shiftDay } = require("../src/utils/marketSession");

async function main() {
  const [email, firstDay, lastDay = shiftDay(marketDayKey(new Date()), -1)] = process.argv.slice(2);
  const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day ?? "") &&
    !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;

  if (!email || !validDay(firstDay) || !validDay(lastDay) || firstDay > lastDay) {
    throw new Error("Usage: npm run premarket:backfill -- ACCOUNT_EMAIL FIRST_DATE [LAST_DATE]");
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("Trader account not found.");
  const scan = await getScan(user.id);
  if (!scan.symbols.length) throw new Error("Save the scan universe in Trader first.");

  let captured = 0;
  let skipped = 0;
  for (let day = firstDay; day <= lastDay; day = shiftDay(day, 1)) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const checkpoint of CHECKPOINTS) {
      try {
        await capture(scan, day, checkpoint);
        captured += 1;
      } catch (error) {
        if (error.statusCode !== 422) throw error;
        skipped += 1;
      }
    }
  }
  console.log(`Saved or already present: ${captured}. No premarket session data: ${skipped}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
