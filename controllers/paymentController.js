import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import { sendSlotBookingEmail } from "../utils/slotConfirmationMail.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";

//create-payment
export const createPayment = TryCatch(async (req, res) => {
  const { feeId, amount, mode, transactionId, note, paidAt, isAdvance } =
    req.body;

  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

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
  try {
    await sendSlotBookingEmail(existingFee);
    console.log(
      `Slot booking email sent for student ${existingFee.student.name}`
    );
  } catch (err) {
    console.error("Error sending slot booking email:", err);
  }

  //create communication log
  if (payment) {
    await addCommunicationLogEntry(
      loggedById,
      "PAYMENT_CREATED",
      new Date(),
      "Payment Created",
      `Payment created by ${userName} and slot booking email sent for student ${existingFee.student.name} (${existingFee.student.currentBatch.name})`,
      existingFee.studentId || null,
      userLocationId
    );
  }
  sendResponse(res, 201, true, "Payment created successfully.", payment);
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
  const { amount, mode, transactionId, note, dueDate, paidAt, isAdvance } =
    req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { fee: true, student: { include: { currentBatch: true } } },
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
    include: { student: true },
    data: {
      balanceAmount: newBalance,
      status: newBalance === 0 ? "PAID" : "PENDING",
      advanceAmount: isAdvance ? amount : null,
    },
  });
  
  //send slot booking email if isAdvance is true
  if (isAdvance) {
    try {
      await sendSlotBookingEmail(updatedFee);
      console.log(
        `Slot booking email sent for student ${updatedFee.student.name}`
      );
    } catch (err) {
      console.error("Error sending slot booking email:", err);
    }
  }

  //create communication log
  if (updatedPayment) {
    await addCommunicationLogEntry(
      loggedById,
      "PAYMENT_UPDATED",
      new Date(),
      "Payment Updated",
      `Payment updated by ${userName} for ${payment.student.name} (${payment.student.currentBatch.name})`,
      payment.studentId || null,
      userLocationId
    );
  }

  sendResponse(res, 200, true, "Payment recorded successfully", {
    payment: updatedPayment,
    fee: updatedFee,
  });
});

//delete payment
export const deletePayment = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { fee: true, student: { include: { currentBatch: true } } },
  });

  if (!payment) return sendResponse(res, 404, false, "Payment not found", null);

  // Delete Payment
  await prisma.payment.delete({
    where: { id: paymentId },
  });
  //create communication log
  await addCommunicationLogEntry(
    loggedById,
    "PAYMENT_DELETED",
    new Date(),
    "Payment Deleted",
    `Payment deleted by ${userName} for ${payment.student.name} (${payment.student.currentBatch.name})`,
    payment.studentId || null,
    userLocationId
  );
  sendResponse(res, 200, true, "Payment deleted successfully", payment);
});

//-----------------create payment due------------------------------------
export const createPaymentDue = TryCatch(async (req, res) => {
  const { feeId } = req.params;
  const { amount, dueDate, note } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  // Check if fee exists
  const existingFee = await prisma.fee.findUnique({
    where: { id: feeId },
    include: {
      student: {
        include: { currentBatch: true },
      },
    },
  });

  if (!existingFee) {
    return sendResponse(res, 404, false, "Fee not found", null);
  }

  // add payment due and log communication in a transaction
  const payment = await prisma.$transaction(async (tx) => {
    // 1️⃣ Create payment due
    const newPayment = await tx.payment.create({
      data: {
        amount,
        dueDate,
        note,
        feeId,
        studentId: existingFee.studentId,
        status: "PENDING",
      },
    });

    return newPayment;
  });

  //create communication log
  if (payment) {
    await addCommunicationLogEntry(
      loggedById,
      "PAYMENT_DUE_CREATED",
      new Date(),
      "Payment Due Created",
      `Payment due created by ${userName} for ${existingFee.student.name} (${existingFee.student.currentBatch.name})`,
      payment.studentId || null,
      userLocationId
    );
  }
  return sendResponse(
    res,
    200,
    true,
    "Payment due created successfully",
    payment
  );
});

//edit payment due
export const editPaymentDue = TryCatch(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, dueDate, note } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) return sendResponse(res, 404, false, "Payment not found", null);
  const updatedPayment = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      amount,
      dueDate,
      note,
    },
  });
  //create communication log
  if (updatedPayment) {
    await addCommunicationLogEntry(
      loggedById,
      "PAYMENT_DUE_UPDATED",
      new Date(),
      "Payment Due Updated",
      `Payment due updated by ${userName}`,
      studentId || null,
      userLocationId
    );
  }
  sendResponse(
    res,
    200,
    true,
    "Payment due updated successfully",
    updatedPayment
  );
});
