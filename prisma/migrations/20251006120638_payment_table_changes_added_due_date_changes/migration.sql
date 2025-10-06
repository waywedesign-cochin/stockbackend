/*
  Warnings:

  - Made the column `mode` on table `payments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `paidAt` on table `payments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."payments" ALTER COLUMN "mode" SET NOT NULL,
ALTER COLUMN "paidAt" SET NOT NULL;
