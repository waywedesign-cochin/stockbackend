/*
  Warnings:

  - Made the column `batchId` on table `payments` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."payments" DROP CONSTRAINT "payments_batchId_fkey";

-- AlterTable
ALTER TABLE "public"."payments" ALTER COLUMN "batchId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
