/*
  Warnings:

  - You are about to drop the column `date` on the `director_ledgers` table. All the data in the column will be lost.
  - Added the required column `transactionDate` to the `director_ledgers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."director_ledgers" DROP COLUMN "date",
ADD COLUMN     "transactionDate" TIMESTAMP(3) NOT NULL;
