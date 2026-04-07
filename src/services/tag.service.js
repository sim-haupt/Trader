const prisma = require("../config/prisma");

function normalizeTagName(name) {
  return String(name || "").trim();
}

async function listTags(actor) {
  const tags = await prisma.savedTag.findMany({
    where: actor.role === "ADMIN" ? undefined : { userId: actor.id },
    orderBy: { name: "asc" }
  });

  return tags;
}

async function ensureTags(userId, tagString) {
  const tags = [...new Set(
    String(tagString || "")
      .split(",")
      .map(normalizeTagName)
      .filter(Boolean)
  )];

  if (tags.length === 0) {
    return;
  }

  await prisma.$transaction(
    tags.map((name) =>
      prisma.savedTag.upsert({
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

async function createTag(actor, payload) {
  const name = normalizeTagName(payload.name);

  return prisma.savedTag.upsert({
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

async function deleteTag(actor, tagId) {
  const where = {
    id: tagId
  };

  if (actor.role !== "ADMIN") {
    where.userId = actor.id;
  }

  await prisma.savedTag.deleteMany({ where });

  return { message: "Tag deleted successfully" };
}

module.exports = {
  listTags,
  ensureTags,
  createTag,
  deleteTag
};
