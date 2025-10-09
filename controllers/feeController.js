import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import e from "express";

export const getFees = TryCatch(async (req, res) => {
  const { studentId } = req.params;
  const fees = await prisma.fee.findMany({
    where: { studentId },
    include: {
      student: {
        include: {
          currentBatch: true,
        },
      },
    },
  });
  sendResponse(res, 200, true, "Fees fetched successfully", fees);
});

//update fee
export const updateFee = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { discountAmount, feePaymentMode } = req.body;

  const existingFee = await prisma.fee.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          currentBatch: true,
        },
      },
    },
  });

  if (!existingFee) {
    return sendResponse(res, 404, false, "Fee not found", null);
  }

  // Calculate finalDiscount
  const finalDiscount =
    discountAmount !== undefined ? discountAmount : existingFee.discountAmount;

  // Update finalFee and balanceAmount based on discount
  const updatedFinalFee = (existingFee.totalCourseFee || 0) - finalDiscount;

  const updatedBalance =
    feePaymentMode === "fullPayment"
      ? 0
      : existingFee.advanceAmount
      ? existingFee.balanceAmount
      : updatedFinalFee;

  //Update Fee
  const fee = await prisma.fee.update({
    where: { id },
    data: {
      discountAmount: finalDiscount,
      finalFee: updatedFinalFee,
      balanceAmount: updatedBalance,
      advanceAmount: existingFee.advanceAmount
        ? existingFee.advanceAmount
        : null,
      feePaymentMode,
      status: feePaymentMode === "fullPayment" ? "PAID" : "PENDING",
    },
  });

  // 1️⃣ Delete Scheduled Payments
  await prisma.payment.deleteMany({
    where: {
      feeId: id,
      paidAt: null,
      dueDate: { not: null },
    },
  });

  if (existingFee.advanceAmount) {
    const scheduledPayments = [];
    const batchStartDate = existingFee.student.currentBatch.startDate;

    if (feePaymentMode === "weekly") {
      const weeks = 4;
      const perWeek = Math.floor(updatedBalance / weeks);

      for (let i = 0; i < weeks; i++) {
        const dueDate = new Date(
          batchStartDate > new Date() ? batchStartDate : new Date()
        );
        dueDate.setDate(dueDate.getDate() + 7 * i);
        scheduledPayments.push({
          amount: perWeek,
          dueDate,
          studentId: existingFee.studentId,
          feeId: existingFee.id,
        });
      }
    } else if (feePaymentMode === "70/30") {
      const first = Math.round(updatedBalance * 0.7);
      const second = updatedBalance - first;

      const firstDue = new Date(
        batchStartDate > new Date() ? batchStartDate : new Date()
      );
      const secondDue = new Date(
        batchStartDate > new Date() ? batchStartDate : new Date()
      );
      secondDue.setDate(secondDue.getDate() + 30);

      scheduledPayments.push(
        {
          amount: first,
          dueDate: firstDue,
          studentId: existingFee.studentId,
          feeId: existingFee.id,
        },
        {
          amount: second,
          dueDate: secondDue,
          studentId: existingFee.studentId,
          feeId: existingFee.id,
        }
      );
    }

    // scheduled payments
    if (scheduledPayments.length > 0) {
      await prisma.payment.createMany({ data: scheduledPayments });
    }
  }

  sendResponse(
    res,
    200,
    true,
    "Fee updated successfully. Scheduled payments deleted.",
    fee
  );
});
