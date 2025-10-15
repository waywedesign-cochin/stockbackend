import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import crypto from "crypto";

export const switchBatch = TryCatch(async (req, res) => {
  const { studentId, fromBatchId, toBatchId, changeDate, reason } = req.body;

  // Validate student
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return sendResponse(res, 404, false, "Student not found", null);
  if (student.currentBatchId !== fromBatchId)
    return sendResponse(res, 400, false, "Current batch mismatch", null);

  // Validate target batch
  const toBatch = await prisma.batch.findUnique({
    where: { id: toBatchId },
    include: { course: true },
  });
  if (!toBatch)
    return sendResponse(res, 404, false, "Target batch not found", null);
  if (toBatch.currentCount >= toBatch.slotLimit)
    return sendResponse(res, 400, false, "Target batch is full", null);

  // Old fee
  const oldFee = await prisma.fee.findFirst({
    where: { studentId, batchId: fromBatchId },
    include: {
      payments: true,
      batch: {
        select: {
          course: {
            select: { baseFee: true, mode: true },
          },
        },
      },
    },
  });

  if (!oldFee)
    return sendResponse(res, 404, false, "Old fee record not found", null);

  //Prevent duplicate fee for same toBatch
  const existingNewFee = await prisma.fee.findFirst({
    where: { studentId, batchId: toBatchId },
  });

  if (existingNewFee)
    return sendResponse(
      res,
      400,
      false,
      "Student already has a fee record for the target batch",
      null
    );

  // Calculate total paid in old batch
  const totalPaidOld =
    oldFee.payments.reduce((sum, p) => sum + p.amount, 0) || 0;

  // Calculate final fee for new batch
  const finalFee =
    oldFee.batch.course.mode === "ONLINE"
      ? toBatch.course.baseFee - totalPaidOld
      : oldFee.balanceAmount;

  // Generate transfer ID
  const transferId = crypto.randomUUID();

  // Create new fee record for the new batch
  const newFee = await prisma.fee.create({
    data: {
      studentId,
      batchId: toBatchId,
      totalCourseFee: toBatch.course.baseFee,
      finalFee,
      balanceAmount: finalFee,
      transferId,
      status: "PENDING",
    },
  });

  // Perform rest in a transaction
  const [updatedOldFee, batchHistory] = await prisma.$transaction([
    prisma.fee.update({
      where: { id: oldFee.id },
      data: { status: "TRANSFERRED", transferId },
    }),
    prisma.batchHistory.create({
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

  return sendResponse(res, 200, true, "Batch switched successfully", {
    batchHistory,
    oldFee: updatedOldFee,
    newFee,
    transferId,
  });
});
