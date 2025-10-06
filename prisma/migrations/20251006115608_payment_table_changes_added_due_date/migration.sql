-- AlterTable
ALTER TABLE "public"."payments" ADD COLUMN     "dueDate" TIMESTAMP(3),
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;
