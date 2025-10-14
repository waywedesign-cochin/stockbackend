import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

//create-payment
export const createPayment = TryCatch(async (req, res) => {
  const { feeId, amount, mode, transactionId, note, paidAt, isAdvance } =
    req.body;

  const existingFee = await prisma.fee.findUnique({
    where: { id: feeId },
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

  //calculate balance
  const updatedBalance = existingFee.balanceAmount - amount;

  // if (isAdvance) {
  //   const scheduledPayments = [];
  //   const batchStartDate = existingFee.student.currentBatch.startDate;

  //   if (existingFee.feePaymentMode === "weekly") {
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

  //     const perWeek = installmentMap[courseName] || [
  //       existingFee.balanceAmount / 4,
  //     ]; // fallback

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

  //   if (existingFee.feePaymentMode === "70/30") {
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
  //       Math.round(existingFee.balanceAmount * 0.7),
  //       existingFee.balanceAmount - Math.round(existingFee.balanceAmount * 0.7),
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
      paidAt,
      studentId: existingFee.studentId,
      status: "PAID",
    },
  });

  sendResponse(res, 201, true, "Payment created successfully", payment);
});

//get payments
export const getPayment = TryCatch(async (req, res) => {
  const { studentId } = req.params;
  const payments = await prisma.payment.findMany({
    where: { studentId },
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
    orderBy: {
      dueDate: "asc",
    },
  });
  sendResponse(res, 200, true, "Payments fetched successfully", payments);
});

//update payment
export const editPayment = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, mode, transactionId, note, dueDate, paidAt } = req.body;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { fee: true },
  });

  if (!payment) return sendResponse(res, 404, false, "Payment not found", null);

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
      status: paidAt ? "PAID" : "PENDING",
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
  const { amount, dueDate, note } = req.body;

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
      note,
      studentId: existingFee.studentId,
    },
  });
  sendResponse(res, 200, true, "Payment due created successfully", payment);
});
