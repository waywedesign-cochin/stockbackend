/*
  Warnings:

  - Made the column `debitCredit` on table `director_ledgers` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."director_ledgers" ALTER COLUMN "debitCredit" SET NOT NULL;
