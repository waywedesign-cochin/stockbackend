-- AlterTable
ALTER TABLE "public"."cashbooks" ADD COLUMN     "feeId" TEXT;

-- AlterTable
ALTER TABLE "public"."director_ledgers" ADD COLUMN     "feeId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."cashbooks" ADD CONSTRAINT "cashbooks_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "public"."fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "public"."fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
