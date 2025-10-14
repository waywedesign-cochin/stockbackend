-- CreateTable
CREATE TABLE "public"."batchHistories" (
    "id" TEXT NOT NULL,
    "fromBatchId" TEXT NOT NULL,
    "toBatchId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "changeDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batchHistories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."batchHistories" ADD CONSTRAINT "batchHistories_fromBatchId_fkey" FOREIGN KEY ("fromBatchId") REFERENCES "public"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batchHistories" ADD CONSTRAINT "batchHistories_toBatchId_fkey" FOREIGN KEY ("toBatchId") REFERENCES "public"."batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batchHistories" ADD CONSTRAINT "batchHistories_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
