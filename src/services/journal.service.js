const prisma = require("../config/prisma");

async function listJournalDays(actor) {
  return prisma.journalDay.findMany({
    where: {
      ...(actor.role === "ADMIN" ? {} : { userId: actor.id }),
      accountScope: actor.activeAccountScope || "SIMULATOR"
    },
    orderBy: { dayKey: "desc" }
  });
}

async function updateJournalDay(actor, dayKey, payload) {
  const notes =
    payload.notes === undefined
      ? null
      : payload.notes === null || payload.notes === ""
        ? null
        : String(payload.notes);

  return prisma.journalDay.upsert({
    where: {
      userId_accountScope_dayKey: {
        userId: actor.id,
        accountScope: actor.activeAccountScope || "SIMULATOR",
        dayKey
      }
    },
    create: {
      userId: actor.id,
      accountScope: actor.activeAccountScope || "SIMULATOR",
      dayKey,
      notes
    },
    update: {
      notes
    }
  });
}

module.exports = {
  listJournalDays,
  updateJournalDay
};
