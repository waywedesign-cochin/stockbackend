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
    orderBy: {
      createdAt: "desc",
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
          currentBatch: {
            include: {
              course: true,
            },
          },
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
  const updatedFinalFee = (existingFee.finalFee || 0) - finalDiscount;

  const updatedBalance =
    feePaymentMode === "fullPayment"
      ? 0
      : existingFee.advanceAmount
      ? finalDiscount
        ? existingFee.balanceAmount - finalDiscount
        : existingFee.balanceAmount
      : updatedFinalFee;

  //Update Fee
  const fee = await prisma.fee.update({
    where: { id },
    data: {
      batchId: existingFee.student.currentBatchId,
      discountAmount: finalDiscount,
      finalFee: updatedFinalFee,
      balanceAmount: updatedBalance,
      advanceAmount: existingFee.advanceAmount
        ? existingFee.advanceAmount
        : null,
      feePaymentMode,
      status:
        feePaymentMode === "fullPayment" || updatedBalance === 0
          ? "PAID"
          : "PENDING",
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

  // if (existingFee.advanceAmount) {
  //   const scheduledPayments = [];
  //   const batchStartDate = existingFee.student.currentBatch.startDate;

  //   if (feePaymentMode === "weekly") {
  //     const batchStart = new Date(batchStartDate);
  //     const courseName =
  //       existingFee.student.currentBatch.course.name.toUpperCase();

  //     // Define installment mapping for all courses
  //     const installmentMap = {
  //       "STOCK OFFLINE": [5000, 10000, 10000, 5400],
  //       "FOREX OFFLINE": [5000, 10000, 10000, 5400],
  //       "STOCK ONLINE": [5000, 5000, 5000, 5000],
  //       "FOREX ONLINE": [5000, 5000, 5000, 5000],
  //       "STOCK AND FOREX COMBINED (ONLINE)": [16000, 8000, 8000, 7600],
  //       "STOCK AND FOREX COMBINED (OFFLINE)": [
  //         20500, 10500, 10500, 10500, 10800,
  //       ],
  //       "STOCK AND FOREX COMBINED (ONLINE+OFFLINE)": [
  //         18200, 11000, 11000, 11000,
  //       ],
  //       // Add more combinations if needed
  //     };

  //     const perWeek = installmentMap[courseName] || [updatedBalance / 4]; // fallback

  //     perWeek.forEach((amount, index) => {
  //       const dueDate = new Date(batchStart);
  //       dueDate.setDate(dueDate.getDate() + index * 7); // first week = batchStartDate

  //       scheduledPayments.push({
  //         amount,
  //         dueDate,
  //         studentId: existingFee.studentId,
  //         feeId: existingFee.id,
  //       });
  //     });
  //   }
  //   let perPayment;

  //   if (feePaymentMode === "70/30") {
  //     const courseName =
  //       existingFee.student.currentBatch.course.name.toUpperCase();

  //     // Define fixed amounts per course if needed
  //     const coursePaymentMap = {
  //       "STOCK OFFLINE": [19000, 11400], // example
  //       "FOREX OFFLINE": [19000, 11400],
  //       "STOCK ONLINE": [11000, 9000],
  //       "FOREX ONLINE": [11000, 9000],
  //     };

  //     // Use mapped amounts if available, else fallback to 70/30 split
  //     perPayment = coursePaymentMap[courseName] || [
  //       Math.round(updatedBalance * 0.7),
  //       updatedBalance - Math.round(updatedBalance * 0.7),
  //     ];

  //     const firstDue = new Date(
  //       batchStartDate > new Date() ? batchStartDate : new Date()
  //     );
  //     const secondDue = new Date(firstDue);
  //     secondDue.setMonth(secondDue.getMonth() + 1);

  //     scheduledPayments.push(
  //       {
  //         amount: perPayment[0],
  //         dueDate: firstDue,
  //         studentId: existingFee.studentId,
  //         feeId: existingFee.id,
  //       },
  //       {
  //         amount: perPayment[1],
  //         dueDate: secondDue,
  //         studentId: existingFee.studentId,
  //         feeId: existingFee.id,
  //       }
  //     );
  //   }

  //   // scheduled payments
  //   if (scheduledPayments.length > 0) {
  //     await prisma.payment.createMany({ data: scheduledPayments });
  //   }
  // }

  sendResponse(res, 200, true, "Fee updated successfully.", fee);
});
