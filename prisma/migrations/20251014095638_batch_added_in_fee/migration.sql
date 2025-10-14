/*
  Warnings:

  - Added the required column `batchId` to the `fees` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."fees" ADD COLUMN     "batchId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."fees" ADD CONSTRAINT "fees_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
