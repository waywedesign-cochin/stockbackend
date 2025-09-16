/*
  Warnings:

  - Added the required column `duration` to the `courses` table without a default value. This is not possible if the table is not empty.
  - Made the column `description` on table `courses` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."courses" ADD COLUMN     "duration" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "description" SET NOT NULL;
