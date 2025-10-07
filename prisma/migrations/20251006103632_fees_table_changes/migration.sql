/*
  Warnings:

  - Changed the type of `totalCourseFee` on the `fees` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "public"."fees" DROP COLUMN "totalCourseFee",
ADD COLUMN     "totalCourseFee" INTEGER NOT NULL,
ALTER COLUMN "discountAmount" DROP NOT NULL,
ALTER COLUMN "balanceAmount" DROP DEFAULT;
