-- CreateTable
CREATE TABLE "public"."bankTransaction" (
    "id" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "transactionType" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "transactionMode" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "studentId" TEXT,
    "feeId" TEXT,
    "directorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bankTransaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."bankTransaction" ADD CONSTRAINT "bankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankTransaction" ADD CONSTRAINT "bankTransaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankTransaction" ADD CONSTRAINT "bankTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankTransaction" ADD CONSTRAINT "bankTransaction_feeId_fkey" FOREIGN KEY ("feeId") REFERENCES "public"."fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankTransaction" ADD CONSTRAINT "bankTransaction_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
