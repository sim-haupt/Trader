const fs = require("node:fs/promises");
const { parseMoverArchive } = require("../src/utils/marketMovers");
const { marketDayKey } = require("../src/utils/marketSession");

async function run() {
  const [filename] = process.argv.slice(2);
  if (!filename) throw new Error("Usage: npm run movers:import -- path/to/history.csv");
  const days = parseMoverArchive(await fs.readFile(filename, "utf8"));
  const today = marketDayKey(new Date());
  if ([...days.keys()].some((day) => day > today)) throw new Error("Historical summaries cannot use future trading dates.");
  const prisma = require("../src/config/prisma");
  try {
    await require("../src/services/market-movers.service").importArchive(days);
    console.log(`Imported ${days.size} trading dates.`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => { console.error(error.message); process.exitCode = 1; });
