-- AlterTable
ALTER TABLE "public"."cashbooks" ADD COLUMN     "studentId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."cashbooks" ADD CONSTRAINT "cashbooks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
