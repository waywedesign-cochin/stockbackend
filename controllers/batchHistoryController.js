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
    where: { studentId, status: "PENDING" },
    include: { payments: true },
  });
  if (!oldFee)
    return sendResponse(res, 404, false, "Old fee record not found", null);

  const totalPaidOld =
    oldFee.payments.reduce((sum, p) => sum + p.amount, 0) || 0;
  const transferId = crypto.randomUUID();

  // --- TRANSFER (keep same fee, just update batch) revenue stays at the same batch---
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
          feeManageMode: "TRANSFER",
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

  // NEW FEE  revenue shift to new batch
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
              feeManageMode: "NEW_FEE",
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
      if (totalPaidOld > toBatch.course.baseFee) {
        return sendResponse(
          res,
          400,
          false,
          "Student has paid more than the new batch fee. Please create a new admission.",
          null
        );
      }
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

          const isPaid =
            oldFee.balanceAmount === 0 || totalPaidOld >= oldFee.finalFee;
          //Update old fee status
          const updatedOldFee = await tx.fee.update({
            where: { id: oldFee.id },
            data: {
              status: isPaid ? "PAID" : "INACTIVE",
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
              feeManageMode: "SPLIT",
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

//edi switch
export const editBatchSwitch = TryCatch(async (req, res) => {
  const {
    studentId,
    batchHistoryId,
    newToBatchId,
    newFeeAction,
    changeDate,
    reason,
  } = req.body;

  const { userId: loggedById, locationId, name: userName } = req.user;

  // 1️⃣ Fetch latest history
  const latestHistory = await prisma.batchHistory.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });

  if (!latestHistory || latestHistory.id !== batchHistoryId)
    return sendResponse(
      res,
      400,
      false,
      "Only latest switch can be edited",
      null
    );

  const oldFromBatchId = latestHistory.fromBatchId;
  const oldToBatchId = latestHistory.toBatchId;
  const oldFeeFrom = latestHistory.feeIdFrom;
  const oldFeeTo = latestHistory.feeIdTo;

  const student = await prisma.student.findUnique({ where: { id: studentId } });

  const toBatch = await prisma.batch.findUnique({
    where: { id: newToBatchId },
    include: { course: true },
  });

  if (!toBatch)
    return sendResponse(res, 404, false, "Target batch not found", null);
  if (toBatch.currentCount >= toBatch.slotLimit)
    return sendResponse(res, 400, false, "Target batch is full", null);

  const transferId = crypto.randomUUID();

  await prisma.$transaction(async (tx) => {
    // =====================================================
    // 🔁 STEP 1: REVERSE PREVIOUS SWITCH
    // =====================================================

    // restore student batch
    await tx.student.update({
      where: { id: studentId },
      data: { currentBatchId: oldFromBatchId },
    });

    // restore batch counts
    await tx.batch.update({
      where: { id: oldFromBatchId },
      data: { currentCount: { increment: 1 } },
    });

    await tx.batch.update({
      where: { id: oldToBatchId },
      data: { currentCount: { decrement: 1 } },
    });

    // reverse fee logic
    if (oldFeeFrom !== oldFeeTo) {
      // NEW_FEE or SPLIT

      // move payments back
      await tx.payment.updateMany({
        where: {
          feeId: oldFeeTo,
          NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
        },
        data: { feeId: oldFeeFrom },
      });

      // delete new fee
      await tx.fee.delete({ where: { id: oldFeeTo } });

      // reactivate old fee
      await tx.fee.update({
        where: { id: oldFeeFrom },
        data: { status: "PENDING" },
      });
    }

    // delete history
    await tx.batchHistory.delete({
      where: { id: batchHistoryId },
    });

    const currentStudent = await tx.student.findUnique({
      where: { id: studentId },
    });

    // =====================================================
    // 🔄 STEP 2: APPLY NEW SWITCH
    // =====================================================

    const activeFee = await tx.fee.findFirst({
      where: {
        studentId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      include: { payments: true },
    });

    if (!activeFee) throw new Error("Active fee missing");

    const totalPaid = activeFee.payments.reduce((s, p) => s + p.amount, 0) || 0;

    // ---------------- TRANSFER ----------------
    if (newFeeAction === "TRANSFER") {
      await tx.batchHistory.create({
        data: {
          studentId,
          fromBatchId: currentStudent.currentBatchId,
          toBatchId: newToBatchId,
          changeDate,
          reason,
          transferId,
          feeIdFrom: activeFee.id,
          feeIdTo: activeFee.id,
          feeManageMode: "TRANSFER",
        },
      });
    }

    // ---------------- NEW_FEE ----------------
    if (newFeeAction === "NEW_FEE") {
      const newFee = await tx.fee.create({
        data: {
          studentId,
          batchId: newToBatchId,
          totalCourseFee: toBatch.course.baseFee,
          finalFee: toBatch.course.baseFee,
          balanceAmount: Math.max(toBatch.course.baseFee - totalPaid, 0),
          status: "PENDING",
        },
      });

      await tx.payment.updateMany({
        where: { feeId: activeFee.id },
        data: { feeId: newFee.id },
      });

      await tx.fee.update({
        where: { id: activeFee.id },
        data: { status: "CANCELLED" },
      });

      await tx.batchHistory.create({
        data: {
          studentId,
          fromBatchId: currentStudent.currentBatchId,
          toBatchId: newToBatchId,
          changeDate,
          reason,
          transferId,
          feeIdFrom: activeFee.id,
          feeIdTo: newFee.id,
          feeManageMode: "NEW_FEE",
        },
      });
    }

    // ---------------- SPLIT ----------------
    if (newFeeAction === "SPLIT") {
      const adjusted = Math.max(toBatch.course.baseFee - totalPaid, 0);

      const newFee = await tx.fee.create({
        data: {
          studentId,
          batchId: newToBatchId,
          totalCourseFee: toBatch.course.baseFee,
          finalFee: adjusted,
          balanceAmount: adjusted,
          status: "PENDING",
        },
      });
      const isPaid =
        activeFee.balanceAmount === 0 || totalPaid >= activeFee.finalFee;
      //Update old fee status
      await tx.fee.update({
        where: { id: activeFee.id },
        data: {
          status: isPaid ? "PAID" : "INACTIVE",
        },
      });

      await tx.batchHistory.create({
        data: {
          studentId,
          fromBatchId: currentStudent.currentBatchId,
          toBatchId: newToBatchId,
          changeDate,
          reason,
          transferId,
          feeIdFrom: activeFee.id,
          feeIdTo: newFee.id,
          feeManageMode: "SPLIT",
        },
      });
    }

    // update student + batch
    await tx.student.update({
      where: { id: studentId },
      data: { currentBatchId: newToBatchId },
    });

    await tx.batch.update({
      where: { id: currentStudent.currentBatchId },
      data: { currentCount: { decrement: 1 } },
    });

    await tx.batch.update({
      where: { id: newToBatchId },
      data: { currentCount: { increment: 1 } },
    });
  });

  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

  await addCommunicationLogEntry(
    loggedById,
    "BATCH_SWITCH_EDITED",
    new Date(),
    "Batch Switch Edited",
    `Batch switch edited for ${student.name} by ${userName}`,
    studentId,
    locationId
  );

  return sendResponse(res, 200, true, "Batch switch edited successfully", null);
});
