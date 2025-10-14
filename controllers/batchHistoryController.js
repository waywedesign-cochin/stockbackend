import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import crypto from "crypto";

export const switchBatch = TryCatch(async (req, res) => {
  const { studentId, fromBatchId, toBatchId, changeDate, reason } = req.body;

  // validate student
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) return sendResponse(res, 404, false, "Student not found", null);
  if (student.currentBatchId !== fromBatchId)
    return sendResponse(res, 400, false, "Current batch mismatch", null);

  // validate target batch
  const toBatch = await prisma.batch.findUnique({
    where: { id: toBatchId },
    include: { course: true },
  });
  if (!toBatch)
    return sendResponse(res, 404, false, "Target batch not found", null);
  if (toBatch.currentCount >= toBatch.slotLimit)
    return sendResponse(res, 400, false, "Target batch is full", null);

  // old fee
  const oldFee = await prisma.fee.findFirst({
    where: { studentId, batchId: fromBatchId },
    include: {
      payments: true,
      batch: {
        select: {
          course: {
            select: {
              baseFee: true,
              mode: true,
            },
          },
        },
      },
    },
  });

  // total paid in old batch
  const totalPaidOld =
    oldFee?.payments.reduce((sum, p) => sum + p.amount, 0) || 0;

  const finalFee =
    oldFee.batch.course.mode === "ONLINE"
      ? toBatch.course.baseFee - totalPaidOld
      : oldFee.balanceAmount;
  // create new fee for new batch
  const newFee = await prisma.fee.create({
    data: {
      studentId,
      batchId: toBatchId,
      totalCourseFee: toBatch.course.baseFee,
      finalFee: finalFee,
      balanceAmount: finalFee,
      status: "PENDING",
    },
  });

  // Generate transferId
  const transferId = crypto.randomUUID();

  // Db transaction batchHistory + student update + batch counts
  const [batchHistory] = await prisma.$transaction([
    prisma.batchHistory.create({
      data: {
        studentId,
        fromBatchId,
        toBatchId,
        changeDate,
        reason,
        transferId,
        feeIdFrom: oldFee?.id,
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
    // Optionally mark old fee as transferred
    oldFee
      ? prisma.fee.update({
          where: { id: oldFee.id },
          data: { status: "TRANSFERRED" },
        })
      : undefined,
  ]);

  return sendResponse(res, 200, true, "Batch switched successfully", {
    batchHistory,
    oldFee,
    newFee,
    transferId,
  });
});
