/*
  Warnings:

  - You are about to drop the column `batchId` on the `payments` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."payments" DROP CONSTRAINT "payments_batchId_fkey";

-- AlterTable
ALTER TABLE "public"."payments" DROP COLUMN "batchId";
