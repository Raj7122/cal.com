-- CreateEnum
CREATE TYPE "MeetingSummaryStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "MeetingSummary" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "summary" TEXT,
    "status" "MeetingSummaryStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "model" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingSummary_bookingId_key" ON "MeetingSummary"("bookingId");

-- AddForeignKey
ALTER TABLE "MeetingSummary" ADD CONSTRAINT "MeetingSummary_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CalVideoSettings" ADD COLUMN "enableAIMeetingSummary" BOOLEAN NOT NULL DEFAULT false;

-- Seed feature flag
INSERT INTO "Feature" ("slug", "enabled", "type", "description", "createdAt", "updatedAt")
VALUES ('ai-meeting-summary', false, 'OPERATIONAL', 'AI-powered meeting summary generation from Cal Video transcripts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
