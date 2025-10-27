-- CreateTable
CREATE TABLE "public"."cashbooks" (
    "id" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "debitCredit" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashbooks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."cashbooks" ADD CONSTRAINT "cashbooks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
