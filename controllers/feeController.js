import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

export const getFees = TryCatch(async (req, res) => {
  const { studentId } = req.params;
  const fees = await prisma.fee.findMany({
    where: { studentId },
  });
  sendResponse(res, 200, true, "Fees fetched successfully", fees);
});

//update fee
export const updateFee = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { discountAmount = 0, feePaymentMode } = req.body;
  const existingFee = await prisma.fee.findUnique({
    where: { id },
  });
  if (!existingFee) {
    return sendResponse(res, 404, false, "Fee not found", null);
  }
  const updatedFinalFee = existingFee.finalFee - discountAmount;
  const updatedBalance = feePaymentMode === "fullPayment" ? 0 : updatedFinalFee;

  const fee = await prisma.fee.update({
    where: { id },
    data: {
      discountAmount,
      finalFee: updatedFinalFee,
      balanceAmount: updatedBalance,
      feePaymentMode,
      status: feePaymentMode === "fullPayment" ? "PAID" : "PENDING",
    },
  });

  sendResponse(res, 200, true, "Fee updated successfully", fee);
});
