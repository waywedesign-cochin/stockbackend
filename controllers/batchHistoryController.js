import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import crypto from "crypto";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import { clearRedisCache } from "../utils/redisCache.js";

export const switchBatch = TryCatch(async (req, res) => {
  const { studentId, fromBatchId, toBatchId, changeDate, reason, feeAction } =
    req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  // Validate student
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return sendResponse(res, 404, false, "Student not found", null);
  if (student.currentBatchId !== fromBatchId)
    return sendResponse(res, 400, false, "Current batch mismatch", null);

  // Validate source batch
  const fromBatch = await prisma.batch.findUnique({
    where: { id: fromBatchId },
    include: { course: true },
  });
  // Validate target batch
  const toBatch = await prisma.batch.findUnique({
    where: { id: toBatchId },
    include: { course: true },
  });
  if (!toBatch)
    return sendResponse(res, 404, false, "Target batch not found", null);
  if (toBatch.currentCount >= toBatch.slotLimit)
    return sendResponse(res, 400, false, "Target batch is full", null);

  // Fetch old fee
  const oldFee = await prisma.fee.findFirst({
    where: { studentId, batchId: fromBatchId },
    include: { payments: true },
  });
  if (!oldFee)
    return sendResponse(res, 404, false, "Old fee record not found", null);

  const totalPaidOld =
    oldFee.payments.reduce((sum, p) => sum + p.amount, 0) || 0;
  const transferId = crypto.randomUUID();

  // --- TRANSFER (keep same fee, just update batch) ---
  if (feeAction === "TRANSFER") {
    const [updatedFee, batchHistory] = await prisma.$transaction([
      // // Update existing fee record to point to new batch
      // prisma.fee.update({
      //   where: { id: oldFee.id },
      //   data: {
      //     batchId: toBatchId,
      //     totalCourseFee: toBatch.course.baseFee,
      //     balanceAmount: Math.max(toBatch.course.baseFee - totalPaidOld, 0),
      //     finalFee: Math.max(toBatch.course.baseFee - totalPaidOld, 0),
      //     status: "ACTIVE",
      //     transferId,
      //     note: `Transferred from previous batch on ${changeDate}`,
      //   },
      // }),
      prisma.batchHistory.create({
        data: {
          studentId,
          fromBatchId,
          toBatchId,
          changeDate,
          reason,
          transferId,
          feeIdFrom: oldFee.id,
          feeIdTo: oldFee.id, // same fee record
        },
      }),
      prisma.student.update({
        where: { id: studentId },
        data: { currentBatchId: toBatchId },
      }),
      prisma.batch.update({
        where: { id: fromBatchId },
        data: { currentCount: { decrement: 1 } },
      }),
      prisma.batch.update({
        where: { id: toBatchId },
        data: { currentCount: { increment: 1 } },
      }),
    ]);
    if (batchHistory) {
      await addCommunicationLogEntry(
        loggedById,
        "BATCH_SWITCHED",
        new Date(),
        "Batch Switched",
        `Student ${student.name} has been transferred from batch ${fromBatch.name} to batch ${toBatch.name}. Switch processed by ${userName}.`,
        student.id,
        userLocationId
      );
    }

    //clear redis cache for student, batch and revenue details
    await clearRedisCache("students:*");
    await clearRedisCache("studentsRevenue:*");
    await clearRedisCache("batches:*");

    return sendResponse(res, 200, true, "Batch switched successfully", {
      batchHistory,
      transferId,
    });
  }

  // NEW FEE early switching before batch start date or after 2 or three days from start date
  if (feeAction === "NEW_FEE") {
    try {
      const newFeeAmount = Math.max(toBatch.course.baseFee - totalPaidOld, 0);
  
      const { newFee, updatedOldFee, batchHistory } = await prisma.$transaction(
        async (tx) => {
          // 1️⃣ Create new fee
          const newFee = await tx.fee.create({
            data: {
              studentId,
              batchId: toBatchId,
              totalCourseFee: toBatch.course.baseFee,
              finalFee: toBatch.course.baseFee,
              balanceAmount: newFeeAmount,
              advanceAmount: oldFee ? oldFee.advanceAmount : null,
              status: "PENDING",
            },
          });
  
          // 2️⃣ Create batch history (before updating old fee)
          const batchHistory = await tx.batchHistory.create({
            data: {
              studentId,
              fromBatchId,
              toBatchId,
              changeDate,
              reason,
              transferId,
              feeIdFrom: oldFee.id,
              feeIdTo: newFee.id,
            },
          });
  
          // 3️⃣ Move old payments to the new fee (instead of cancelling)
          await tx.payment.updateMany({
            where: {
              studentId,
              feeId: oldFee.id,
              NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
            },
            data: { feeId: newFee.id },
          });
  
          // 4️⃣ Update old fee status to CANCELLED (soft delete)
          const updatedOldFee = await tx.fee.update({
            where: { id: oldFee.id },
            data: { status: "CANCELLED" },
          });
  
          // 5️⃣ Update student's current batch
          await tx.student.update({
            where: { id: studentId },
            data: { currentBatchId: toBatchId },
          });
  
          // 6️⃣ Update batch counts
          await tx.batch.update({
            where: { id: fromBatchId },
            data: { currentCount: { decrement: 1 } },
          });
  
          await tx.batch.update({
            where: { id: toBatchId },
            data: { currentCount: { increment: 1 } },
          });
  
          return { newFee, updatedOldFee, batchHistory };
        },
        { timeout: 15000 }
      );
  
      // 🟩 After successful transaction
      if (batchHistory) {
        await addCommunicationLogEntry(
          loggedById,
          "BATCH_SWITCHED",
          new Date(),
          "Batch Switched",
          `Student ${student.name} has been transferred from batch ${fromBatch.name} to batch ${toBatch.name}. Switch processed by ${userName}.`,
          student.id,
          userLocationId
        );
      }
  
      // 🧹 Clear Redis cache (outside transaction)
      await clearRedisCache("students:*");
      await clearRedisCache("studentsRevenue:*");
      await clearRedisCache("batches:*");
  
      return sendResponse(res, 200, true, "Batch switched successfully", {
        batchHistory,
        oldFee: updatedOldFee,
        newFee,
        transferId,
      });
    } catch (error) {
      console.error("Batch switch transaction failed:", error);
      return sendResponse(res, 500, false, "Failed to switch batch", { error });
    }
  }
  

  // --- SPLIT --- keep old fee and create new fee for new batch
  if (feeAction === "SPLIT") {
    try {
      // Adjust new fee based on total paid in old fee
      const adjustedFee = Math.max(toBatch.course.baseFee - totalPaidOld, 0);

      const { newFee, updatedOldFee, batchHistory } = await prisma.$transaction(
        async (tx) => {
          // 1️⃣ Create new fee
          const newFee = await tx.fee.create({
            data: {
              studentId,
              batchId: toBatchId,
              totalCourseFee: toBatch.course.baseFee,
              finalFee: adjustedFee,
              balanceAmount: adjustedFee,
              status: "PENDING",
              transferId,
            },
          });

          // 2️⃣ Update old fee
          const updatedOldFee = await tx.fee.update({
            where: { id: oldFee.id },
            data: {
              status: oldFee.balanceAmount === 0 ? "PAID" : "INACTIVE",
              transferId,
            },
          });

          // 3️⃣ Create batch history record
          const batchHistory = await tx.batchHistory.create({
            data: {
              studentId,
              fromBatchId,
              toBatchId,
              changeDate,
              reason,
              transferId,
              feeIdFrom: oldFee.id,
              feeIdTo: newFee.id,
            },
          });

          // 4️⃣ Update student's current batch
          await tx.student.update({
            where: { id: studentId },
            data: { currentBatchId: toBatchId },
          });

          // 5️⃣ Decrement count from old batch
          await tx.batch.update({
            where: { id: fromBatchId },
            data: { currentCount: { decrement: 1 } },
          });

          // 6️⃣ Increment count for new batch
          await tx.batch.update({
            where: { id: toBatchId },
            data: { currentCount: { increment: 1 } },
          });

          return { newFee, updatedOldFee, batchHistory };
        },
        {
          timeout: 15000, // give it up to 15s to complete
        }
      );

      // ✅ After successful transaction
      if (batchHistory) {
        await addCommunicationLogEntry(
          loggedById,
          "BATCH_SWITCHED",
          new Date(),
          "Batch Switched",
          `Student ${student.name} has been transferred from batch ${fromBatch.name} to batch ${toBatch.name}. Switch processed by ${userName}.`,
          student.id,
          userLocationId
        );
      }

      // 🧹 Clear Redis cache (outside transaction)
      await clearRedisCache("students:*");
      await clearRedisCache("studentsRevenue:*");
      await clearRedisCache("batches:*");

      return sendResponse(res, 200, true, "Batch switched (SPLIT mode)", {
        batchHistory,
        oldFee: updatedOldFee,
        newFee,
        transferId,
      });
    } catch (error) {
      console.error("❌ Batch switch (SPLIT) transaction failed:", error);
      return sendResponse(
        res,
        500,
        false,
        "Failed to switch batch (SPLIT mode)",
        {
          error,
        }
      );
    }
  }

  return sendResponse(res, 400, false, "Invalid feeAction provided", null);
});
