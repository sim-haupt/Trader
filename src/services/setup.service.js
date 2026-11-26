const prisma = require("../config/prisma");
const ApiError = require("../utils/ApiError");

const MAX_IMAGES = 8;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

const setupFields = {
  id: true,
  setupId: true,
  grade: true,
  notes: true,
  shareSize: true,
  images: {
    orderBy: { position: "asc" },
    select: { id: true, originalName: true, thumbnailUrl: true }
  }
};

function detectImageType(data) {
  if (data.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (data.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  throw new ApiError(400, "Choose PNG, JPEG, GIF, or WebP images.");
}

function prepareImages(files, thumbnailField) {
  if (files.reduce((size, file) => size + file.size, 0) > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, "Images must total 24 MB or less per upload.");
  }

  let thumbnails;
  try {
    thumbnails = JSON.parse(thumbnailField || "[]");
  } catch {
    throw new ApiError(400, "Invalid image previews.");
  }

  if (!Array.isArray(thumbnails) || thumbnails.length !== files.length || thumbnails.some((thumbnail) =>
    typeof thumbnail !== "string" || thumbnail.length > 50000 ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(thumbnail)
  )) {
    throw new ApiError(400, "An image preview is missing or invalid.");
  }

  return files.map((file, index) => ({
    originalName: file.originalname,
    mimeType: detectImageType(file.buffer),
    thumbnailUrl: thumbnails[index],
    data: file.buffer
  }));
}

async function list(userId) {
  const setups = await prisma.savedStrategy.findMany({
    where: { userId },
    select: { id: true, name: true, variants: { select: setupFields } },
    orderBy: { name: "asc" }
  });

  return setups.flatMap(({ id, name, variants }) => variants.length
    ? variants.map((variant) => ({ ...variant, name }))
    : [{ id: null, setupId: id, name, grade: "", notes: "", shareSize: null, images: [] }]
  );
}

function handleDuplicateGrade(error) {
  if (error.code === "P2002") {
    throw new ApiError(409, "This setup already has a version with that grade.");
  }
  throw error;
}

function create(userId, { name, grade, notes, shareSize, thumbnails }, files = []) {
  const images = prepareImages(files, thumbnails);
  return prisma.$transaction(async (db) => {
    await db.savedStrategy.createMany({ data: { userId, name }, skipDuplicates: true });
    const setup = await db.savedStrategy.findUniqueOrThrow({
      where: { userId_name: { userId, name } },
      select: { id: true }
    });
    const variant = await db.setupVariant.create({
      data: {
        setupId: setup.id,
        grade,
        notes,
        shareSize,
        images: { create: images.map((image, position) => ({ ...image, position })) }
      },
      select: setupFields
    });
    return { ...variant, name };
  }).catch(handleDuplicateGrade);
}

function update(userId, id, payload, files = []) {
  const images = prepareImages(files, payload.thumbnails);

  return prisma.$transaction(async (db) => {
    // Updating the variant first locks it so concurrent uploads append in order.
    const { setup, ...variant } = await db.setupVariant.update({
      where: { id, setup: { userId } },
      data: { grade: payload.grade, notes: payload.notes, shareSize: payload.shareSize },
      select: { ...setupFields, setup: { select: { name: true } } }
    });
    if (images.length === 0) return { ...variant, name: setup.name };

    if (variant.images.length + images.length > MAX_IMAGES) {
      throw new ApiError(400, `A setup can have up to ${MAX_IMAGES} images.`);
    }

    const updated = await db.setupVariant.update({
      where: { id },
      data: {
        images: {
          create: images.map((image, index) => ({ ...image, position: variant.images.length + index }))
        }
      },
      select: setupFields
    });
    return { ...updated, name: setup.name };
  }).catch(handleDuplicateGrade);
}

async function getImage(userId, id) {
  const image = await prisma.setupImage.findFirst({
    where: { id, variant: { setup: { userId } } },
    select: { data: true, mimeType: true }
  });
  if (!image) throw new ApiError(404, "Setup image not found.");
  return image;
}

module.exports = { MAX_IMAGES, list, create, update, getImage };
