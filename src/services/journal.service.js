const prisma = require("../config/prisma");

async function listJournalDays(actor) {
  return prisma.journalDay.findMany({
    where: actor.role === "ADMIN" ? undefined : { userId: actor.id },
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
      userId_dayKey: {
        userId: actor.id,
        dayKey
      }
    },
    create: {
      userId: actor.id,
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
