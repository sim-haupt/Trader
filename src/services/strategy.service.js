const prisma = require("../config/prisma");

function normalizeStrategyName(name) {
  return String(name || "").trim();
}

async function listStrategies(actor) {
  return prisma.savedStrategy.findMany({
    where: actor.role === "ADMIN" ? undefined : { userId: actor.id },
    orderBy: { name: "asc" }
  });
}

async function ensureStrategies(userId, strategyString) {
  const strategies = [...new Set(
    String(strategyString || "")
      .split(",")
      .map(normalizeStrategyName)
      .filter(Boolean)
  )];

  if (strategies.length === 0) {
    return;
  }

  await prisma.$transaction(
    strategies.map((name) =>
      prisma.savedStrategy.upsert({
        where: {
          userId_name: {
            userId,
            name
          }
        },
        create: {
          userId,
          name
        },
        update: {}
      })
    )
  );
}

async function createStrategy(actor, payload) {
  const name = normalizeStrategyName(payload.name);

  return prisma.savedStrategy.upsert({
    where: {
      userId_name: {
        userId: actor.id,
        name
      }
    },
    create: {
      userId: actor.id,
      name
    },
    update: {}
  });
}

async function deleteStrategy(actor, strategyId) {
  const where = { id: strategyId };

  if (actor.role !== "ADMIN") {
    where.userId = actor.id;
  }

  await prisma.savedStrategy.deleteMany({ where });

  return { message: "Strategy deleted successfully" };
}

module.exports = {
  listStrategies,
  ensureStrategies,
  createStrategy,
  deleteStrategy
};
