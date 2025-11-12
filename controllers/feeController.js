import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import { clearRedisCache } from "../utils/redisCache.js";

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
  const {
    discountAmount,
    feePaymentMode,
    finalFee,
    totalCourseFee,
    balanceAmount,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  const existingFee = await prisma.fee.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          currentBatch: {
            include: { course: true },
          },
        },
      },
    },
  });

  if (!existingFee) {
    return sendResponse(res, 404, false, "Fee not found", null);
  }

  // ----Fee calculations  ----

  // Prefer body values if provided, otherwise fall back to DB values
  const baseFee = totalCourseFee ?? existingFee.totalCourseFee ?? 0;
  const existingDiscount = existingFee.discountAmount || 0;
  const existingBalance = existingFee.balanceAmount || 0;

  // Discount may be updated
  const finalDiscount =
    discountAmount !== undefined ? discountAmount : existingDiscount;

  // Updated final fee (if provided use directly, else recalc)
  const updatedFinalFee = finalFee ?? baseFee - finalDiscount;

  // Compute how much is already paid
  let alreadyPaid = baseFee - existingDiscount - existingBalance;
  if (alreadyPaid < 0) alreadyPaid = 0;

  // Updated balance — depends on payment mode
  let updatedBalance;
  if (balanceAmount !== undefined && balanceAmount !== null) {
    // if req body has new balanceAmount use that instead of existing balance
    updatedBalance = balanceAmount;
  } else if (feePaymentMode === "fullPayment") {
    updatedBalance = 0;
  } else {
    updatedBalance = updatedFinalFee - alreadyPaid;
  }

  if (updatedBalance < 0) updatedBalance = 0;

  // Debug log
  // console.log({
  //   baseFee,
  //   existingDiscount,
  //   existingBalance,
  //   finalDiscount,
  //   updatedFinalFee,
  //   alreadyPaid,
  //   updatedBalance,
  //   fromBody: { discountAmount, finalFee, totalCourseFee, balanceAmount },
  // });

  // ----✅ UPDATE DATABASE ----

  const fee = await prisma.fee.update({
    where: { id },
    data: {
      batchId: existingFee.student.currentBatchId,
      discountAmount: finalDiscount,
      finalFee: updatedFinalFee,
      totalCourseFee: baseFee,
      balanceAmount: updatedBalance,
      advanceAmount: existingFee.advanceAmount || null,
      feePaymentMode,
      status:
        feePaymentMode === "fullPayment" || updatedBalance === 0
          ? "PAID"
          : "PENDING",
    },
  });

  // ----🧹 CLEAR OLD SCHEDULED PAYMENTS ----
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

  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

  //create communication log
  await addCommunicationLogEntry(
    loggedById,
    "FEE_UPDATED",
    new Date(),
    "Fee Updated",
    `Fee updated by ${userName} for ${existingFee.student.name} (${existingFee.student.currentBatch.name}). All scheduled payments have been reset.`,
    existingFee?.studentId || null,
    userLocationId
  );

  sendResponse(res, 200, true, "Fee updated successfully.", fee);
});
