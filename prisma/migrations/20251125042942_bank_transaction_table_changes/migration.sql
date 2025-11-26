/*
  Warnings:

  - A unique constraint covering the columns `[bankTransactionId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `status` to the `bankTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."bankTransaction" ADD COLUMN     "status" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."payments" ADD COLUMN     "bankTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_bankTransactionId_key" ON "public"."payments"("bankTransactionId");

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "public"."bankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
