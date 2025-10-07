import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

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
export const recordPayment = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, mode, transactionId, note } = req.body;

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
      transactionId,
      note,
      paidAt: new Date(),
      status: "PAID",
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
