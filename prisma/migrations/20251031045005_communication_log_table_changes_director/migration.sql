-- AlterTable
ALTER TABLE "public"."communication_logs" ADD COLUMN     "directorId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."communication_logs" ADD CONSTRAINT "communication_logs_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
