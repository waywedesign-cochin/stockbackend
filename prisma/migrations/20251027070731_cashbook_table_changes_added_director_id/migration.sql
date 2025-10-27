-- AlterTable
ALTER TABLE "public"."cashbooks" ADD COLUMN     "directorId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."cashbooks" ADD CONSTRAINT "cashbooks_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
