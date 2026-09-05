const path = require("path");
const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");

function normalizeTagName(name) {
  return String(name || "").trim();
}

function parseTags(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return [...new Set(value.map(normalizeTagName).filter(Boolean))];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.map(normalizeTagName).filter(Boolean))];
    }
  } catch (err) {
    // Fall back to comma-separated form data.
  }

  return [...new Set(String(value).split(",").map(normalizeTagName).filter(Boolean))];
}

function mapReviewImage(image) {
  return {
    ...image,
    tags: image.tags?.map((item) => item.tag) || []
  };
}

function buildStoredFilename(originalName) {
  const extension = path.extname(originalName || "").toLowerCase();
  const safeExtension = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)
    ? extension
    : ".png";

  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`;
}

function buildDataUrl(file) {
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
}

async function ensureReviewTags(userId, names) {
  if (names.length === 0) {
    return [];
  }

  const tags = await Promise.all(
    names.map((name) =>
      prisma.tradeReviewTag.upsert({
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

  return tags;
}

async function listReviewImages(actor, filters = {}) {
  const tagNames = filters.tag || [];
  const where = {
    userId: actor.id,
    accountScope: actor.activeAccountScope
  };

  if (tagNames.length > 0) {
    where.tags = {
      some: {
        tag: {
          name: {
            in: tagNames
          }
        }
      }
    };
  }

  const images = await prisma.tradeReviewImage.findMany({
    where,
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return images.map(mapReviewImage);
}

async function listReviewTags(actor) {
  return prisma.tradeReviewTag.findMany({
    where: { userId: actor.id },
    orderBy: { name: "asc" }
  });
}

async function createReviewImage(actor, file, payload) {
  if (!file) {
    throw new ApiError(400, "Image file is required");
  }

  const tagNames = parseTags(payload.tags);
  const tags = await ensureReviewTags(actor.id, tagNames);

  const image = await prisma.tradeReviewImage.create({
    data: {
      userId: actor.id,
      accountScope: actor.activeAccountScope,
      filename: buildStoredFilename(file.originalname),
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      imageUrl: buildDataUrl(file),
      notes: String(payload.notes || "").trim() || null,
      tags: {
        create: tags.map((tag) => ({
          tag: {
            connect: {
              id: tag.id
            }
          }
        }))
      }
    },
    include: {
      tags: {
        include: {
          tag: true
        }
      }
    }
  });

  return mapReviewImage(image);
}

async function updateReviewImage(actor, imageId, payload) {
  const existingImage = await prisma.tradeReviewImage.findFirst({
    where: {
      id: imageId,
      userId: actor.id
    }
  });

  if (!existingImage) {
    throw new ApiError(404, "Trade review image was not found");
  }

  const tagNames = parseTags(payload.tags);
  const tags = await ensureReviewTags(actor.id, tagNames);

  const image = await prisma.$transaction(async (tx) => {
    await tx.tradeReviewImageTag.deleteMany({
      where: {
        imageId: existingImage.id
      }
    });

    return tx.tradeReviewImage.update({
      where: {
        id: existingImage.id
      },
      data: {
        notes: String(payload.notes || "").trim() || null,
        tags: {
          create: tags.map((tag) => ({
            tag: {
              connect: {
                id: tag.id
              }
            }
          }))
        }
      },
      include: {
        tags: {
          include: {
            tag: true
          }
        }
      }
    });
  });

  return mapReviewImage(image);
}

async function deleteReviewImage(actor, imageId) {
  const image = await prisma.tradeReviewImage.findFirst({
    where: {
      id: imageId,
      userId: actor.id
    }
  });

  if (!image) {
    throw new ApiError(404, "Trade review image was not found");
  }

  await prisma.tradeReviewImage.delete({
    where: {
      id: image.id
    }
  });

  return { message: "Trade review image deleted successfully" };
}

module.exports = {
  listReviewImages,
  listReviewTags,
  createReviewImage,
  updateReviewImage,
  deleteReviewImage
};
