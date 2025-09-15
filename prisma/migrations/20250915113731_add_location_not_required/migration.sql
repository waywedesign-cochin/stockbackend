-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_locationId_fkey";

-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "locationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
