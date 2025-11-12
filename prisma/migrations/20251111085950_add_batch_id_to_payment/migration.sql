-- AlterTable
ALTER TABLE "public"."payments" ADD COLUMN     "batchId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
