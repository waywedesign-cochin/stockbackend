-- AlterTable
ALTER TABLE "public"."director_ledgers" ADD COLUMN     "cashbookId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_cashbookId_fkey" FOREIGN KEY ("cashbookId") REFERENCES "public"."cashbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
