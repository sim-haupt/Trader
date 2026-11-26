BEGIN;

CREATE TABLE "SetupVariant" (
  "id" TEXT PRIMARY KEY,
  "setupId" TEXT NOT NULL REFERENCES "SavedStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "grade" TEXT NOT NULL DEFAULT '' CHECK ("grade" IN ('', 'A+', 'A', 'B', 'C')),
  "notes" TEXT NOT NULL DEFAULT '',
  "shareSize" INTEGER CHECK ("shareSize" > 0)
);

CREATE UNIQUE INDEX "SetupVariant_setupId_grade_key" ON "SetupVariant"("setupId", "grade");

CREATE TABLE "SetupImage" (
  "id" TEXT PRIMARY KEY,
  "variantId" TEXT NOT NULL REFERENCES "SetupVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "position" INTEGER NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "thumbnailUrl" TEXT NOT NULL,
  "data" BYTEA NOT NULL
);

CREATE UNIQUE INDEX "SetupImage_variantId_position_key" ON "SetupImage"("variantId", "position");

COMMIT;
