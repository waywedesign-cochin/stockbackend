import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import {
  clearRedisCache,
  getRedisCache,
  setRedisCache,
} from "../utils/redisCache.js";
import { sendFeeCompletionEmail } from "../utils/sendFeeCompletionMail.js";

//ADD CASHBOOK ENTRY---------------------------------------------
export const addCashbookEntry = TryCatch(async (req, res) => {
  const {
    transactionDate,
    amount,
    transactionType,
    description,
    locationId,
    referenceId,
    studentId,
    directorId,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  // to track if fee completed
  let updatedFeeId = null;

  const result = await prisma.$transaction(async (tx) => {
    // create cashbook entry
    const newEntry = await tx.cashbook.create({
      data: {
        transactionDate,
        amount,
        transactionType,
        debitCredit:
          transactionType === "STUDENT_PAID" ||
          transactionType === "OTHER_INCOME"
            ? "CREDIT"
            : "DEBIT",
        description,
        locationId,
        referenceId,
        studentId,
        directorId,
      },
    });

    // if studentId is present update fee and create payment
    if (studentId) {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { fees: true },
      });

      if (!student) {
        sendResponse(res, 404, false, "Student not found");
        return;
      }

      if (!student.fees || student.fees.length === 0) {
        sendResponse(res, 400, false, "No fee record found for this student");
        return;
      }

      const fee = student.fees[0];
      const updatedBalance = Math.max(
        fee.balanceAmount !== null
          ? fee.balanceAmount - amount
          : fee.balanceAmount + fee.finalFee - amount,
        0
      );
      const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

      await tx.cashbook.update({
        where: { id: newEntry.id },
        data: {
          feeId: fee.id,
        },
      });

      const updatedFee = await tx.fee.update({
        where: { id: fee.id },
        data: {
          balanceAmount: updatedBalance,
          status: newStatus,
        },
      });

      await tx.payment.create({
        data: {
          amount,
          feeId: fee.id,
          mode: "CASH",
          studentId,
          paidAt: transactionDate,
          status: "PAID",
          note: description || "Cash payment recorded",
          cashbookId: newEntry.id,
          transactionId: referenceId || null,
        },
      });

      // check if fee completed
      if (updatedFee.status === "PAID") {
        updatedFeeId = updatedFee.id;
      }
    }
    if (transactionType === "OWNER_TAKEN" && directorId) {
      await tx.directorLedger.create({
        data: {
          transactionDate,
          amount,
          transactionType: "OWNER_TAKEN",
          debitCredit: "CREDIT",
          description: description || "Owner cash withdrawal",
          referenceId,
          directorId,
          locationId,
          cashbookId: newEntry.id,
        },
      });
    }
    //clear redis cache
    await clearRedisCache("directorLedger:*");
    return newEntry;
  });

  if (!result)
    return sendResponse(res, 400, false, "Cashbook entry creation failed");

  //if fee completed send fee completion mail
  if (updatedFeeId) {
    const latestFee = await prisma.fee.findUnique({
      where: { id: updatedFeeId },
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

  await addCommunicationLogEntry(
    loggedById,
    "CASHBOOK_ENTRY_ADDED",
    new Date(),
    "Cashbook Entry Added",
    `A new cashbook entry has been added by ${userName}.`,
    studentId || null,
    userLocationId,
    directorId || null
  );
  //clear redis cache
  await clearRedisCache("cashbook:*");
  // Success response
  return sendResponse(
    res,
    201,
    true,
    "Cashbook entry added successfully",
    result
  );
});

//GET CASHBOOK ENTRIES----------------------------------------------------------------------
export const getCashbookEntries = TryCatch(async (req, res) => {
  const { locationId, month, year, search, transactionType, page, limit } =
    req.query;

  //redis cache
  const redisKey = `cashbook:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache (Cashbook)");
    return sendResponse(
      res,
      200,
      true,
      "Cashbook entries fetched successfully",
      JSON.parse(cachedResponse)
    );
  }

  if (!locationId) {
    return res
      .status(400)
      .json({ success: false, message: "locationId is required" });
  }

  const pageNumber = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const skip = (pageNumber - 1) * pageSize;

  // ---------- Period Filter ----------
  const periodFilter = { locationId };

  if (year) {
    if (month && month !== "allmonths") {
      periodFilter.transactionDate = {
        gte: new Date(year, parseInt(month, 10) - 1, 1),
        lte: new Date(year, parseInt(month, 10), 0, 23, 59, 59, 999),
      };
    } else {
      periodFilter.transactionDate = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }
  }

  if (search)
    periodFilter.description = { contains: search, mode: "insensitive" };

  // ---------- Totals for all types ----------
  const totals = await prisma.cashbook.groupBy({
    by: ["transactionType"],
    where: { ...periodFilter },
    _sum: { amount: true },
  });
  // ---------- Total Debit and Credit ----------
  const debitCreditTotals = await prisma.cashbook.groupBy({
    by: ["debitCredit"],
    where: { ...periodFilter },
    _sum: {
      amount: true,
    },
  });

  const totalDebit =
    debitCreditTotals.find((t) => t.debitCredit === "DEBIT")?._sum.amount || 0;
  const totalCredit =
    debitCreditTotals.find((t) => t.debitCredit === "CREDIT")?._sum.amount || 0;

  // ---------- Calculate Opening Balance ----------
  let openingBalance = 0;

  const openingEntryExists = await prisma.cashbook.findFirst({
    where: {
      locationId,
      transactionDate:
        month && month !== "allmonths"
          ? { lt: new Date(year, parseInt(month, 10) - 1, 1) }
          : { lt: new Date(year, 0, 1) },
    },
  });

  if (openingEntryExists) {
    const openingEntries = await prisma.cashbook.findMany({
      where: {
        locationId,
        transactionDate:
          month && month !== "allmonths"
            ? { lt: new Date(year, parseInt(month, 10) - 1, 1) }
            : { lt: new Date(year, 0, 1) },
      },
    });

    openingEntries.forEach((e) => {
      if (e.transactionType === "STUDENT_PAID" && e.debitCredit === "CREDIT") {
        openingBalance += e.amount;
      } else if (
        (e.transactionType === "OWNER_TAKEN" ||
          e.transactionType === "OFFICE_EXPENSE") &&
        e.debitCredit === "DEBIT"
      ) {
        openingBalance -= e.amount;
      }
    });
  }

  // ---------- Period Balance ----------
  let periodBalance = 0;
  const periodEntries = await prisma.cashbook.findMany({
    where: { ...periodFilter },
  });

  periodEntries.forEach((e) => {
    if (e.transactionType === "STUDENT_PAID" && e.debitCredit === "CREDIT") {
      periodBalance += e.amount;
    } else if (
      (e.transactionType === "OWNER_TAKEN" ||
        e.transactionType === "OFFICE_EXPENSE") &&
      e.debitCredit === "DEBIT"
    ) {
      periodBalance -= e.amount;
    }
  });

  const closingBalance = openingBalance + periodBalance;

  // ---------- Entries (apply transactionType filter only here) ----------
  const cashbookFilter = { ...periodFilter };
  if (transactionType) cashbookFilter.transactionType = transactionType;

  const entries = await prisma.cashbook.findMany({
    where: cashbookFilter,
    include: { student: { include: { currentBatch: true } }, director: true },
    skip,
    take: pageSize,
    orderBy: { transactionDate: "desc" },
  });

  const totalCount = await prisma.cashbook.count({ where: cashbookFilter });
  const responseData = {
    totals: {
      studentsPaid:
        totals.find((t) => t.transactionType === "STUDENT_PAID")?._sum.amount ||
        0,
      officeExpense:
        totals.find((t) => t.transactionType === "OFFICE_EXPENSE")?._sum
          .amount || 0,
      ownerTaken:
        totals.find((t) => t.transactionType === "OWNER_TAKEN")?._sum.amount ||
        0,
      otherExpenses:
        totals.find((t) => t.transactionType === "OTHER_EXPENSE")?._sum
          .amount || 0,
      otherIncome:
        totals.find((t) => t.transactionType === "OTHER_INCOME")?._sum.amount ||
        0,
      periodBalance,
      openingBalance,
      closingBalance,
      cashInHand: closingBalance,
      totalDebit,
      totalCredit,
    },
    entries,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      totalEntries: totalCount,
    },
  };
  //set redis cache
  await setRedisCache(redisKey, JSON.stringify(responseData));
  // ---------- Response ----------
  sendResponse(
    res,
    200,
    true,
    "Cashbook entries fetched successfully",
    responseData
  );
});

//UPDATE CASHBOOK ENTRY---------------------------------------------
export const updateCashbookEntry = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    transactionDate,
    amount,
    transactionType,
    description,
    referenceId,
    studentId,
    directorId,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  // to track if fee completed
  let updatedFeeId = null;

  const existing = await prisma.cashbook.findUnique({
    where: { id },
    include: { student: { include: { fees: true } } },
  });

  if (!existing)
    return sendResponse(res, 404, false, "Cashbook entry not found");

  // if studentId changed
  if (
    transactionType === "STUDENT_PAID" &&
    studentId &&
    existing.studentId !== studentId
  ) {
    const newEntry = await prisma.$transaction(async (tx) => {
      // 1️⃣ Reverse fee update for old student
      if (existing.student) {
        const oldFee = existing.student.fees[0];
        if (oldFee) {
          await tx.fee.update({
            where: { id: oldFee.id },
            data: {
              balanceAmount: oldFee.balanceAmount + amount,
              status: "PENDING",
            },
          });

          await tx.payment.deleteMany({
            where: {
              cashbookId: id,
              studentId: existing.studentId,
            },
          });
        }
      }

      // 2️⃣ Delete old cashbook entry
      await tx.cashbook.delete({ where: { id } });

      // 3️⃣ Create new entry + update fee for new student
      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { fees: true },
      });

      if (!student) {
        sendResponse(res, 404, false, "Student not found");
        return;
      }

      if (!student.fees || student.fees.length === 0) {
        sendResponse(res, 400, false, "No fee record found for this student");
        return;
      }
      //update fee for new student
      const fee = student.fees[0];
      const updatedBalance = Math.max(
        fee.balanceAmount === null
          ? fee.balanceAmount + fee.finalFee - amount
          : fee.balanceAmount - amount,
        0
      );
      const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

      const updatedFee = await tx.fee.update({
        where: { id: fee.id },
        data: {
          balanceAmount: updatedBalance,
          status: newStatus,
        },
      });

      // Create new cashbook entry
      const entry = await tx.cashbook.create({
        data: {
          transactionDate,
          amount,
          transactionType,
          debitCredit:
            transactionType === "STUDENT_PAID" ||
            transactionType === "OTHER_INCOME"
              ? "CREDIT"
              : "DEBIT",
          description,
          referenceId,
          studentId,
          locationId: userLocationId,
          feeId: fee.id,
        },
      });

      await tx.payment.create({
        data: {
          amount,
          feeId: fee.id,
          mode: "CASH",
          studentId,
          paidAt: transactionDate,
          status: "PAID",
          note: description || "Cash payment updated",
          transactionId: entry.referenceId || null,
          cashbookId: entry.id,
        },
      });

      //to track if fee completed
      if (updatedFee.status === "PAID") {
        updatedFeeId = updatedFee.id;
      }

      //return new entry
      return entry;
    });
    if (!newEntry)
      return sendResponse(res, 400, false, "Transaction failed or incomplete");
    if (updatedFeeId) {
      const latestFee = await prisma.fee.findUnique({
        where: { id: updatedFeeId },
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
    await addCommunicationLogEntry(
      loggedById,
      "CASHBOOK_ENTRY_UPDATED",
      new Date(),
      "Cashbook entry updated",
      `Cashbook entry updated by ${userName}, student changed.`,
      studentId || null,
      userLocationId,
      existing.directorId || null
    );
    //clear redis cache
    await clearRedisCache("cashbook:*");
    if (newEntry.transactionType === "OWNER_TAKEN")
      await clearRedisCache("directorLedger:*");
    return sendResponse(
      res,
      200,
      true,
      "Student changed and entry updated successfully",
      newEntry
    );
  }

  //directorId changed
  if (
    transactionType === "OWNER_TAKEN" &&
    directorId &&
    existing.directorId !== directorId
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      // Update cashbook entry first
      const updatedCashbook = await tx.cashbook.update({
        where: { id },
        data: {
          transactionDate,
          amount,
          transactionType,
          debitCredit: "DEBIT",
          description,
          referenceId,
          directorId, // store director on cashbook too
        },
      });

      //delete old ledger entry
      await tx.directorLedger.deleteMany({ where: { cashbookId: id } });

      //create new ledger entry
      await tx.directorLedger.create({
        data: {
          transactionDate,
          amount,
          transactionType: "OWNER_TAKEN",
          debitCredit: "CREDIT",
          description: description || "Owner cash withdrawal (updated)",
          referenceId,
          directorId,
          locationId: userLocationId,
          cashbookId: updatedCashbook.id,
        },
      });

      return updatedCashbook;
    });

    if (!updated)
      return sendResponse(res, 400, false, "Cashbook entry update failed");
    //create communication log
    await addCommunicationLogEntry(
      loggedById,
      "CASHBOOK_ENTRY_UPDATED",
      new Date(),
      "Cashbook entry updated",
      `Cashbook entry updated by ${userName}, director changed.`,
      studentId || null,
      userLocationId,
      directorId || null
    );
    //clear redis cache
    await clearRedisCache("cashbook:*");
    await clearRedisCache("directorLedger:*");
    sendResponse(res, 200, true, "Entry updated successfully", updated);
  }

  // If studentId is same, simple update
  const result = await prisma.$transaction(async (tx) => {
    const updatedEntry = await tx.cashbook.update({
      where: { id },
      data: {
        transactionDate,
        amount,
        transactionType,
        debitCredit:
          transactionType === "STUDENT_PAID" ||
          transactionType === "OTHER_INCOME"
            ? "CREDIT"
            : "DEBIT",
        description,
        referenceId,
      },
    });

    // if linked to student, update fee and payment amount
    if (studentId) {
      //fetch fee linked to cashbook
      const fee = await tx.fee.findUnique({
        where: { id: existing.feeId },
        include: { payments: true },
      });

      // fetch old payment record connected to this cashbook entry
      const oldPayment = await tx.payment.findUnique({
        where: { cashbookId: id },
      });

      if (fee && oldPayment) {
        const updatedBalance = Math.max(
          fee.balanceAmount + oldPayment.amount - amount,
          0
        );
        const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";
        //update fee
        const updatedFee = await tx.fee.update({
          where: { id: fee.id },
          data: {
            balanceAmount: updatedBalance,
            status: newStatus,
          },
        });
        //update payment created based on this cashbook entry
        await tx.payment.update({
          where: { cashbookId: id },
          data: {
            amount,
            feeId: fee.id,
            mode: "CASH",
            studentId,
            paidAt: transactionDate,
            status: "PAID",
            note: description || "Cash payment updated",
            transactionId: updatedEntry.referenceId || null,
          },
        });
        //to track if fee completed
        if (updatedFee.status === "PAID") {
          updatedFeeId = updatedFee.id;
        }
      }
    }

    return updatedEntry;
  });

  //if linked to director ledger, update there too
  if (transactionType === "OWNER_TAKEN") {
    await prisma.directorLedger.updateMany({
      where: { cashbookId: id },
      data: {
        transactionDate,
        amount,
        description,
        referenceId,
      },
    });
  }

  if (!result)
    return sendResponse(res, 400, false, "Cashbook entry update failed");

  //if fee completed send fee completion mail
  if (updatedFeeId) {
    const latestFee = await prisma.fee.findUnique({
      where: { id: updatedFeeId },
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
    "CASHBOOK_ENTRY_UPDATED",
    new Date(),
    "Cashbook entry updated",
    `Cashbook entry updated by ${userName}.`,
    studentId || null,
    userLocationId,
    existing.directorId || null
  );

  //clear redis cache
  await clearRedisCache("cashbook:*");
  if (result.transactionType === "OWNER_TAKEN")
    await clearRedisCache("directorLedger:*");
  sendResponse(res, 200, true, "Entry updated successfully", result);
});

//DELETE CASHBOOK ENTRY----------------------------------------------------------------
export const deleteCashbookEntry = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  // Fetch entry with student + fee
  const entry = await prisma.cashbook.findUnique({
    where: { id },
    include: {
      student: true,
      fee: true,
    },
  });

  if (!entry) return sendResponse(res, 404, false, "Cashbook entry not found");

  // ================================================================
  // CASE 1: STUDENT_PAID — reverse fee & payment then delete entry
  // ================================================================
  if (entry.transactionType === "STUDENT_PAID" && entry.studentId) {
    await prisma.$transaction(async (tx) => {
      // Reverse fee update
      if (entry.feeId) {
        const fee = await tx.fee.findUnique({ where: { id: entry.feeId } });

        if (fee) {
          await tx.fee.update({
            where: { id: entry.feeId },
            data: {
              balanceAmount: fee.balanceAmount + entry.amount,
              status: "PENDING",
            },
          });
        }

        // Delete payment
        await tx.payment.deleteMany({ where: { cashbookId: id } });
      }

      // Delete cashbook entry related to student payment
      await tx.cashbook.delete({ where: { id } });
    });

    // Clear Redis cache
    await clearRedisCache("cashbook:*");

    // Log activity
    await addCommunicationLogEntry(
      loggedById,
      "CASHBOOK_ENTRY_DELETED",
      new Date(),
      "Cashbook entry deleted",
      `Cashbook entry deleted by ${userName}, fee/payment reversed.`,
      entry.studentId || null,
      userLocationId,
      null
    );

    return sendResponse(res, 200, true, "Entry deleted successfully", null);
  }

  // ================================================================
  // CASE 2: OWNER_TAKEN — delete ledger + delete cashbook
  // ================================================================
  if (entry.transactionType === "OWNER_TAKEN" && entry.directorId) {
    await prisma.$transaction(async (tx) => {
      await tx.directorLedger.deleteMany({ where: { cashbookId: id } });
      await tx.cashbook.delete({ where: { id } });
    });

    await clearRedisCache("cashbook:*");
    await clearRedisCache("directorLedger:*");

    await addCommunicationLogEntry(
      loggedById,
      "CASHBOOK_ENTRY_DELETED",
      new Date(),
      "Cashbook entry deleted",
      `Cashbook entry deleted by ${userName}.`,
      null,
      userLocationId,
      entry.directorId || null
    );

    return sendResponse(res, 200, true, "Entry deleted successfully", null);
  }

  // ================================================================
  // CASE 3: Other transaction types
  // ================================================================
  await prisma.cashbook.delete({ where: { id } });

  await clearRedisCache("cashbook:*");

  await addCommunicationLogEntry(
    loggedById,
    "CASHBOOK_ENTRY_DELETED",
    new Date(),
    "Cashbook entry deleted",
    `Cashbook entry deleted by ${userName}.`,
    entry.studentId || null,
    userLocationId,
    entry.directorId || null
  );

  return sendResponse(res, 200, true, "Entry deleted successfully", null);
});
