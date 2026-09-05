CREATE TABLE "TradeReviewImage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accountScope" "AccountScope" NOT NULL DEFAULT 'SIMULATOR',
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TradeReviewImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeReviewTag" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TradeReviewTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TradeReviewImageTag" (
  "imageId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,

  CONSTRAINT "TradeReviewImageTag_pkey" PRIMARY KEY ("imageId", "tagId")
);

CREATE INDEX "TradeReviewImage_userId_accountScope_createdAt_idx"
  ON "TradeReviewImage"("userId", "accountScope", "createdAt");

CREATE UNIQUE INDEX "TradeReviewTag_userId_name_key"
  ON "TradeReviewTag"("userId", "name");

CREATE INDEX "TradeReviewTag_userId_createdAt_idx"
  ON "TradeReviewTag"("userId", "createdAt");

CREATE INDEX "TradeReviewImageTag_tagId_idx"
  ON "TradeReviewImageTag"("tagId");

ALTER TABLE "TradeReviewImage"
  ADD CONSTRAINT "TradeReviewImage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeReviewTag"
  ADD CONSTRAINT "TradeReviewTag_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeReviewImageTag"
  ADD CONSTRAINT "TradeReviewImageTag_imageId_fkey"
  FOREIGN KEY ("imageId") REFERENCES "TradeReviewImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TradeReviewImageTag"
  ADD CONSTRAINT "TradeReviewImageTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "TradeReviewTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
