/*
  Warnings:

  - You are about to drop the column `paidAt` on the `cashbooks` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `cashbooks` table. All the data in the column will be lost.
  - Added the required column `transactionDate` to the `cashbooks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."cashbooks" DROP COLUMN "paidAt",
DROP COLUMN "type",
ADD COLUMN     "transactionDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "transactionType" TEXT NOT NULL DEFAULT 'STUDENT_PAID';
