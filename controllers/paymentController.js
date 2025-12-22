import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import { clearRedisCache } from "../utils/redisCache.js";
import { sendSlotBookingEmail } from "../utils/slotConfirmationMail.js";
import { sendFeeCompletionEmail } from "../utils/sendFeeCompletionMail.js";

//create-payment
export const createPayment = TryCatch(async (req, res) => {
  const {
    feeId,
    amount,
    mode,
    transactionId,
    note,
    paidAt,
    isAdvance,
    bankAccountId,
  } = req.body;

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

  //update fee table
  const updatedFee = await prisma.fee.update({
    where: { id: feeId },
    include: {
      student: {
        include: {
          currentBatch: { include: { course: true } },
        },
      },
    },
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

  // create bank transaction
  if (payment) {
    const bankTransaction = await prisma.bankTransaction.create({
      data: {
        amount,
        transactionId,
        transactionDate: paidAt,
        transactionMode: payment.mode,
        transactionType: "CREDIT",
        category: "STUDENT_PAYMENT",
        description: note,
        fee: {
          connect: { id: updatedFee.id },
        },
        location: {
          connect: { id: userLocationId },
        },
        student: {
          connect: { id: updatedFee.studentId },
        },
        bankAccount: {
          connect: { id: bankAccountId },
        },
        status: "COMPLETED",
      },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        bankTransactionId: bankTransaction.id,
      },
    });
    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
    //send slot booking email
    if (isAdvance) {
      try {
        await sendSlotBookingEmail(updatedFee);
        // console.log(
        //   `Slot booking email sent for student ${updatedFee.student.name}`
        // );
      } catch (err) {
        console.error("Error sending slot booking email:", err);
      }
    }

    if (updatedFee && updatedFee.status === "PAID") {
      const latestFee = await prisma.fee.findUnique({
        where: { id: updatedFee.id },
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
          payments: true,
        },
      });
      try {
        await sendFeeCompletionEmail(latestFee);
      } catch (err) {
        console.error("Error sending slot booking email:", err);
      }
    }
    //create communication log
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
  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

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
      bankTransaction: {
        select: {
          id: true,
          bankAccountId: true,
          bankAccount: {
            select: {
              id: true,
              bankName: true,
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
  const {
    amount,
    mode,
    transactionId,
    note,
    dueDate,
    paidAt,
    isAdvance,
    bankAccountId,
  } = req.body;
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

  const { updatedPayment, updatedFee } = await prisma.$transaction(
    async (tx) => {
      // Update Payment
      const updatedPayment = await tx.payment.update({
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
      const totalPaid = await tx.payment.aggregate({
        where: { feeId: payment.feeId, status: "PAID" },
        _sum: { amount: true },
      });

      const newBalance =
        (payment.fee.finalFee || 0) - (totalPaid._sum.amount || 0);

      const updatedFee = await tx.fee.update({
        where: { id: payment.feeId },
        include: {
          student: { include: { currentBatch: { include: { course: true } } } },
        },
        data: {
          balanceAmount: newBalance,
          status: newBalance === 0 ? "PAID" : "PENDING",
          advanceAmount: isAdvance ? amount : payment.fee.advanceAmount,
        },
      });

      if (payment.cashbookId && payment.mode === "CASH") {
        await tx.cashbook.update({
          where: { id: payment.cashbookId },
          data: {
            amount: amount,
            transactionDate: paidAt,
            transactionType: "STUDENT_PAID",
            debitCredit: "CREDIT",
            description: note,
            referenceId: transactionId,
          },
        });
        //clear cashbook cache
        await clearRedisCache("cashbook:*");
      }
      if (payment.directorLedgerId && payment.mode === "DIRECTOR") {
        await tx.directorLedger.update({
          where: { id: payment.directorLedgerId },
          data: {
            amount: amount,
            transactionDate: paidAt,
            transactionType: "STUDENT_PAID",
            debitCredit: "CREDIT",
            description: note,
            referenceId: transactionId,
          },
        });

        //clear director ledger cache
        await clearRedisCache("directorLedger:*");
      }

      //update bank transaction
      const bankTransaction = await tx.bankTransaction.update({
        where: { id: updatedPayment.bankTransactionId },
        data: {
          amount,
          transactionId,
          transactionDate: paidAt,
          transactionMode: updatedPayment.mode,
          transactionType: "CREDIT",
          category: "STUDENT_PAYMENT",
          description: note,
          fee: {
            connect: { id: updatedFee.id },
          },
          location: {
            connect: { id: userLocationId },
          },
          student: {
            connect: { id: updatedFee.studentId },
          },
          bankAccount: {
            connect: { id: bankAccountId },
          },
          status: "COMPLETED",
        },
      });
      await tx.payment.update({
        where: { id: updatedPayment.id },
        data: {
          bankTransactionId: bankTransaction.id,
        },
      });

      // Adjust bank account balance if amount has changed
      const oldAmount = payment.amount;
      const newAmount = updatedPayment.amount;

      const difference = newAmount - oldAmount;

      if (difference !== 0) {
        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: {
            balance:
              difference > 0
                ? { increment: difference }
                : { decrement: Math.abs(difference) },
          },
        });
      }

      return { updatedPayment, updatedFee };
    }
  );

  //create communication log
  if (updatedPayment) {
    //send slot booking email
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
    //If fee payment completed sent mail
    if (updatedFee && updatedFee.status === "PAID") {
      const latestFee = await prisma.fee.findUnique({
        where: { id: updatedFee.id },
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
          payments: true,
        },
      });
      try {
        await sendFeeCompletionEmail(latestFee);
      } catch (err) {
        console.error("Error sending slot booking email:", err);
      }
    }
    //create communication log
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
  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

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
  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

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
  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

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
  //clear cache
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  await clearRedisCache("batches:*");

  sendResponse(
    res,
    200,
    true,
    "Payment due updated successfully",
    updatedPayment
  );
});

//get payment type report
export const getPaymentTypeReport = TryCatch(async (req, res) => {
  const { locationId } = req.query;

  // Fetch payments with optional location filter
  const whereClause = { paidAt: { not: null } };
  if (locationId && locationId !== "ALL") {
    whereClause.fee = {
      batch: {
        locationId: locationId,
      },
    };
  }

  const payments = await prisma.payment.findMany({
    where: whereClause,
    select: {
      id: true,
      mode: true,
      amount: true,
      fee: {
        select: {
          batch: {
            select: {
              locationId: true,
            },
          },
        },
      },
    },
  });
  // Group payments by mode (cash, card, UPI, etc.)
  const paymentTypeMap = {};

  for (const payment of payments) {
    const mode = payment.mode || "Unknown";
    if (!paymentTypeMap[mode]) {
      paymentTypeMap[mode] = 0;
    }
    paymentTypeMap[mode] += payment.amount || 0;
  }

  // Convert to chart-friendly array
  const paymentTypeReport = Object.entries(paymentTypeMap).map(
    ([name, value]) => ({
      name, // e.g. "Cash", "Card", "UPI"
      value, // Total amount for this mode
    })
  );

  return sendResponse(
    res,
    200,
    true,
    "Payment type report fetched successfully",
    { paymentTypeReport }
  );
});
