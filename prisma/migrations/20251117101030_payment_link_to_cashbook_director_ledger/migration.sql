-- AlterTable
ALTER TABLE "public"."payments" ADD COLUMN     "cashbookId" TEXT,
ADD COLUMN     "directorLedgerId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_cashbookId_fkey" FOREIGN KEY ("cashbookId") REFERENCES "public"."cashbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_directorLedgerId_fkey" FOREIGN KEY ("directorLedgerId") REFERENCES "public"."director_ledgers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
