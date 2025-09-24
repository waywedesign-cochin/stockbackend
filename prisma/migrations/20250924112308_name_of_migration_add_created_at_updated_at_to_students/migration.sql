/*
  Warnings:

  - Added the required column `updatedAt` to the `students` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "students" 
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();
