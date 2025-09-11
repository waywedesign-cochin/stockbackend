/*
  Warnings:

  - You are about to drop the column `branchId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Branch` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `locationId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."BatchMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "public"."BatchStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_branchId_fkey";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "branchId",
ADD COLUMN     "locationId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "public"."Branch";

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."batches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "courseId" INTEGER NOT NULL,
    "tutor" TEXT,
    "coordinator" TEXT,
    "slotLimit" INTEGER NOT NULL DEFAULT 30,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "mode" "public"."BatchMode" NOT NULL,
    "status" "public"."BatchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."courses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseFee" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."students" (
    "id" SERIAL NOT NULL,
    "admissionNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "salesperson" TEXT,
    "isFundedAccount" BOOLEAN NOT NULL DEFAULT false,
    "currentBatchId" INTEGER NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "public"."Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "courses_name_key" ON "public"."courses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "students_admissionNo_key" ON "public"."students"("admissionNo");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batches" ADD CONSTRAINT "batches_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batches" ADD CONSTRAINT "batches_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."students" ADD CONSTRAINT "students_currentBatchId_fkey" FOREIGN KEY ("currentBatchId") REFERENCES "public"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
