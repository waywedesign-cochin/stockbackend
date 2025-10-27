-- CreateTable
CREATE TABLE "public"."director_ledgers" (
    "id" TEXT NOT NULL,
    "directorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "debitCredit" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "studentId" TEXT,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "director_ledgers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_directorId_fkey" FOREIGN KEY ("directorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."director_ledgers" ADD CONSTRAINT "director_ledgers_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
