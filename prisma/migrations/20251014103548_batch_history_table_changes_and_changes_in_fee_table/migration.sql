/*
  Warnings:

  - The required column `transferId` was added to the `batchHistories` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "public"."batchHistories" ADD COLUMN     "fee_id_from" TEXT,
ADD COLUMN     "fee_id_to" TEXT,
ADD COLUMN     "transferId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."batchHistories" ADD CONSTRAINT "batchHistories_fee_id_from_fkey" FOREIGN KEY ("fee_id_from") REFERENCES "public"."fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batchHistories" ADD CONSTRAINT "batchHistories_fee_id_to_fkey" FOREIGN KEY ("fee_id_to") REFERENCES "public"."fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
