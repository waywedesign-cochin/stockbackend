/*
  Warnings:

  - A unique constraint covering the columns `[cashbookId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[directorLedgerId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "payments_cashbookId_key" ON "public"."payments"("cashbookId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_directorLedgerId_key" ON "public"."payments"("directorLedgerId");
