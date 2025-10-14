/*
  Warnings:

  - You are about to drop the column `mode` on the `batches` table. All the data in the column will be lost.
  - Added the required column `mode` to the `courses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."batches" DROP COLUMN "mode";

-- AlterTable
ALTER TABLE "public"."courses" ADD COLUMN     "mode" "public"."BatchMode" NOT NULL;
