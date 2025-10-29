/*
  Warnings:

  - You are about to drop the `CommunicationLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."CommunicationLog" DROP CONSTRAINT "CommunicationLog_locationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CommunicationLog" DROP CONSTRAINT "CommunicationLog_loggedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."CommunicationLog" DROP CONSTRAINT "CommunicationLog_studentId_fkey";

-- DropTable
DROP TABLE "public"."CommunicationLog";

-- CreateTable
CREATE TABLE "public"."communication_logs" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "studentId" TEXT,
    "batchId" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."communication_logs" ADD CONSTRAINT "communication_logs_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communication_logs" ADD CONSTRAINT "communication_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."communication_logs" ADD CONSTRAINT "communication_logs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
