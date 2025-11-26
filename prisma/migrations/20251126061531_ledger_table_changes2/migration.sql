-- AlterTable
ALTER TABLE "public"."director_ledgers" ADD COLUMN     "bankTransactionId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "public"."bankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
