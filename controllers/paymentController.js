import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import e from "express";

//create-payment
export const createPayment = TryCatch(async (req, res) => {
  const { feeId, amount, mode, transactionId, note, isAdvance } = req.body;

  const existingFee = await prisma.fee.findUnique({
    where: { id: feeId },
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

  //calculate balance
  const updatedBalance = existingFee.balanceAmount - amount;

  if (isAdvance) {
    const scheduledPayments = [];
    const batchStartDate = existingFee.student.currentBatch.startDate;

    if (existingFee.feePaymentMode === "weekly") {
      const weeks = 4;
      const perWeek = Math.floor(updatedBalance / weeks);

      for (let i = 0; i < weeks; i++) {
        const dueDate = new Date(batchStartDate);
        dueDate.setDate(dueDate.getDate() + 7 * i);
        scheduledPayments.push({
          amount: perWeek,
          dueDate,
          studentId: existingFee.studentId,
          feeId: existingFee.id,
        });
      }
    } else if (existingFee.feePaymentMode === "70/30") {
      const first = Math.round(updatedBalance * 0.7);
      const second = updatedBalance - first;

      const firstDue = new Date(batchStartDate);
      const secondDue = new Date(batchStartDate);
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

  //update fee table

  const updatedFee = await prisma.fee.update({
    where: { id: feeId },
    data: {
      balanceAmount: updatedBalance,
      advanceAmount: isAdvance ? amount : existingFee.advanceAmount || null,
      status: updatedBalance === 0 ? "PAID" : "PENDING",
      feePaymentMode:
        updatedBalance === 0 ? "fullPayment" : existingFee.feePaymentMode,
    },
  });

  //delete dues if balance is 0`
  if (updatedFee.balanceAmount === 0) {
    await prisma.payment.deleteMany({
      where: {
        feeId: updatedFee.id,
        paidAt: null,
        dueDate: { not: null },
      },
    });
  }
  const payment = await prisma.payment.create({
    data: {
      amount,
      mode,
      transactionId,
      note,
      feeId,
      paidAt: new Date(),
      studentId: existingFee.studentId,
      status: "PAID",
    },
  });

  sendResponse(res, 201, true, "Payment created successfully", payment);
});

//get payments
export const getPayment = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const payments = await prisma.payment.findMany({
    where: { id: paymentId },
    include: {
      fee: {
        include: {
          student: {
            include: {
              currentBatch: true,
            },
          },
        },
      },
    },
  });
  sendResponse(res, 200, true, "Payments fetched successfully", payments);
});

//update payment
export const editPayment = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, mode, transactionId, note, dueDate, status, paidAt } =
    req.body;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { fee: true },
  });

  if (!payment) return sendResponse(res, 404, false, "Payment not found", null);

  if (payment.paidAt)
    return sendResponse(res, 400, false, "Payment already recorded", null);

  // Update Payment
  const updatedPayment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      amount,
      mode,
      dueDate,
      transactionId,
      note,
      paidAt,
      status,
    },
  });

  // Recalculate Fee balance
  const totalPaid = await prisma.payment.aggregate({
    where: { feeId: payment.feeId, status: "PAID" },
    _sum: { amount: true },
  });

  const newBalance = (payment.fee.finalFee || 0) - (totalPaid._sum.amount || 0);

  const updatedFee = await prisma.fee.update({
    where: { id: payment.feeId },
    data: {
      balanceAmount: newBalance,
      status: newBalance === 0 ? "PAID" : "PENDING",
    },
  });

  sendResponse(res, 200, true, "Payment recorded successfully", {
    payment: updatedPayment,
    fee: updatedFee,
  });
});

//create payment due
export const createPaymentDue = TryCatch(async (req, res) => {
  const { feeId } = req.params;
  const { amount, dueDate } = req.body;
  const existingFee = await prisma.fee.findUnique({
    where: { id: feeId },
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
  const payment = await prisma.payment.create({
    data: {
      amount,
      dueDate,
      feeId,
      studentId: existingFee.studentId,
    },
  });
  sendResponse(res, 200, true, "Payment due created successfully", payment);
});
