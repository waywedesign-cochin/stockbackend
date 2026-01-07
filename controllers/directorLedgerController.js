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

//ADD DIRECTOR LEDGER ENTRY---------------------------------------------
export const addDirectorLedgerEntry = TryCatch(async (req, res) => {
  const {
    transactionDate,
    amount,
    transactionType,
    description,
    bankAccountId,
    referenceId,
    studentId,
    directorId,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  // Validate director
  if (!directorId)
    return sendResponse(res, 400, false, "Director ID is required");
  const director = await prisma.user.findUnique({
    where: { id: directorId },
  });

  if (!director) {
    return sendResponse(res, 400, false, "Invalid director selected");
  }

  // Validate bank account if transaction type is INSTITUTION_GAVE_BANK
  if (transactionType === "INSTITUTION_GAVE_BANK") {
    if (!bankAccountId) {
      return sendResponse(res, 400, false, "Bank account is required");
    }

    const bankAccount = await prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
    });

    if (!bankAccount) {
      return sendResponse(res, 400, false, "Invalid bank account selected");
    }

    if (bankAccount.balance < amount) {
      return sendResponse(
        res,
        400,
        false,
        "Insufficient balance in bank account"
      );
    }
  }

  // to track if fee completed
  let updatedFeeId = null;
  const result = await prisma.$transaction(async (tx) => {
    // Create director ledger entry
    const newEntry = await tx.directorLedger.create({
      data: {
        transactionDate,
        amount,
        transactionType,
        debitCredit: transactionType === "OTHER_EXPENSE" ? "DEBIT" : "CREDIT",
        description,
        locationId: userLocationId,
        referenceId,
        studentId,
        directorId,
      },
    });

    // Update fee and payment if student payment is involved
    if (studentId) {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { fees: true },
      });

      if (!student) {
        await sendResponse(res, 404, false, "Student not found");
        return null;
      }

      if (!student.fees || student.fees.length === 0) {
        await sendResponse(
          res,
          400,
          false,
          "No fee record found for this student"
        );
        return null;
      }

      const fee = student.fees[0];
      const updatedBalance = Math.max(
        fee.balanceAmount !== null
          ? fee.balanceAmount - amount
          : fee.balanceAmount + fee.finalFee - amount,
        0
      );
      const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

      await tx.directorLedger.update({
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
          mode: "DIRECTOR",
          studentId,
          paidAt: transactionDate,
          status: "PAID",
          note: description || "Cash payment recorded",
          directorLedgerId: newEntry.id,
          transactionId: referenceId || null,
        },
      });

      // check if fee completed
      if (updatedFee.status === "PAID") {
        updatedFeeId = updatedFee.id;
      }
    }
    if (transactionType === "INSTITUTION_GAVE_BANK") {
      //create bank transaction for payment to director
      const bankTransaction = await tx.bankTransaction.create({
        data: {
          amount,
          transactionId: referenceId || null,
          transactionDate: transactionDate,
          transactionMode: "INTERNAL_TRANSFER",
          transactionType: "DEBIT",
          category: "PAYMENT_TO_DIRECTOR",
          description: description || "Payment to director",
          location: {
            connect: { id: userLocationId },
          },
          director: {
            connect: { id: directorId },
          },
          bankAccount: {
            connect: { id: bankAccountId },
          },
          status: "COMPLETED",
        },
      });
      await tx.directorLedger.update({
        where: { id: newEntry.id },
        data: {
          bankTransactionId: bankTransaction.id,
        },
      });

      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });
    }
    return newEntry;
  });
  // final response
  if (!result)
    return sendResponse(res, 400, false, "Ledger entry creation failed");

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
  // Add communication log entry
  await addCommunicationLogEntry(
    loggedById,
    "DIRECTOR_LEDGER_ENTRY_ADDED",
    new Date(),
    "Director Ledger Entry Added",
    `A new director ledger entry has been added by ${userName}.`,
    studentId || null,
    userLocationId,
    directorId || null
  );
  //clear redis cache
  await clearRedisCache("directorLedger:*");
  return sendResponse(res, 200, true, "Entry added successfully", result);
});

//GET DIRECTOR LEDGER ENTRIES---------------------------------------------
export const getDirectorLedgerEntries = TryCatch(async (req, res) => {
  const {
    directorId,
    month,
    year,
    search,
    transactionType,
    debitCredit,
    page,
    limit,
  } = req.query;
  if (!directorId) {
    return res
      .status(400)
      .json({ success: false, message: "directorId is required" });
  }

  //redis cache
  const safeYear = year ? String(year) : "ALL";
  const safeMonth = month ? String(month) : "ALL";
  const safeType = transactionType ? String(transactionType) : "ALL";
  const safeDebitCredit = debitCredit ? String(debitCredit) : "ALL";
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;

  const redisKey = `directorLedger:${directorId}:${safeYear}:${safeMonth}:${safeType}:${safeDebitCredit}:p:${safePage}:l:${safeLimit}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache (Director Ledger)");
    return sendResponse(
      res,
      200,
      true,
      "Director ledger entries fetched successfully",
      JSON.parse(cachedResponse)
    );
  }

  const pageNumber = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const skip = (pageNumber - 1) * pageSize;

  // ---------- Period Filter ----------
  const periodFilter = { directorId };

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

  if (debitCredit) {
    periodFilter.debitCredit = debitCredit;
  }

  // ---------- Totals by transactionType (Respect month/year) ----------
  const totals = await prisma.directorLedger.groupBy({
    by: ["transactionType"],
    where: { ...periodFilter },
    _sum: { amount: true },
  });

  // ---------- Total Debit and Credit (Respect month/year) ----------
  const debitCreditTotals = await prisma.directorLedger.groupBy({
    by: ["debitCredit"],
    where: { ...periodFilter },
    _sum: { amount: true },
  });

  const totalDebit =
    debitCreditTotals.find((t) => t.debitCredit === "DEBIT")?._sum.amount || 0;
  const totalCredit =
    debitCreditTotals.find((t) => t.debitCredit === "CREDIT")?._sum.amount || 0;

  // ---------- Period Balance ----------
  const periodBalance = totalCredit - totalDebit;

  // ---------- Entries (apply transactionType filter ONLY here) ----------
  const dataFilter = { ...periodFilter };
  if (transactionType) dataFilter.transactionType = transactionType;

  const entries = await prisma.directorLedger.findMany({
    where: dataFilter,
    include: {
      student: {
        select: {
          id: true,
          name: true,
          currentBatchId: true,
          currentBatch: { select: { name: true } },
        },
      },
      director: { select: { id: true, username: true, email: true } },
      bankTransaction: {
        include: {
          bankAccount: {
            select: {
              id: true,
              bankName: true,
            },
          },
        },
      },
    },
    skip,
    take: pageSize,
    orderBy: { transactionDate: "desc" },
  });

  const totalCount = await prisma.directorLedger.count({ where: dataFilter });

  const responseData = {
    totals: {
      studentsPaid:
        totals.find((t) => t.transactionType === "STUDENT_PAID")?._sum.amount ||
        0,
      otherExpenses:
        totals.find((t) => t.transactionType === "OTHER_EXPENSE")?._sum
          .amount || 0,
      cashInHand:
        totals.find((t) => t.transactionType === "OWNER_TAKEN")?._sum.amount ||
        0,
      institutionGaveBank:
        totals.find((t) => t.transactionType === "INSTITUTION_GAVE_BANK")?._sum
          .amount || 0,
      // personal:
      //   totals.find((t) => t.transactionType === "PERSONAL")?._sum.amount ||
      //   0,
      totalDebit,
      totalCredit,
      periodBalance,
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
  const hasData =
    entries.length > 0 ||
    Object.values(responseData.totals).some((v) => Number(v) !== 0);

  if (hasData) {
    await setRedisCache(redisKey, JSON.stringify(responseData));
  }
  // ---------- Response ----------
  sendResponse(
    res,
    200,
    true,
    "Director ledger entries fetched successfully",
    responseData
  );
});

//UPDATE DIRECTOR LEDGER ENTRY---------------------------------------------
export const updateDirectorLedgerEntry = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    transactionDate,
    amount,
    transactionType,
    description,
    referenceId,
    bankAccountId,
    studentId, // optional — if linked to a student
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  // to track if fee completed
  let updatedFeeId = null;

  const existing = await prisma.directorLedger.findUnique({
    where: { id },
    include: { student: { include: { fees: true } } },
  });

  if (!existing)
    return sendResponse(res, 404, false, "Director ledger entry not found");

  // if studentId changed
  if (studentId && existing.studentId !== studentId) {
    const newEntry = await prisma.$transaction(async (tx) => {
      // 1️⃣ Reverse fee update for old student (if linked)
      if (existing.student) {
        const oldFee = existing.student.fees[0];
        if (oldFee) {
          await tx.fee.update({
            where: { id: oldFee.id },
            data: {
              balanceAmount: oldFee.balanceAmount + existing.amount,
              status: "PENDING",
            },
          });

          await tx.payment.deleteMany({
            where: {
              studentId: existing.studentId,
              amount: existing.amount,
              feeId: oldFee.id,
            },
          });
        }
      }

      // 2️⃣ Delete old ledger entry
      await tx.directorLedger.delete({ where: { id } });

      // 3️⃣ Add new entry & update fee for new student
      const student = await tx.student.findUnique({
        where: { id: studentId },
        include: { fees: true },
      });

      if (!student) {
        await sendResponse(res, 404, false, "Student not found");
        return;
      }

      if (!student.fees || student.fees.length === 0) {
        await sendResponse(
          res,
          400,
          false,
          "No fee record found for this student"
        );
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

      const updatedFee = await tx.fee.update({
        where: { id: fee.id },
        data: {
          balanceAmount: updatedBalance,
          status: newStatus,
        },
      });

      // 4️⃣ Create new ledger entry
      const entry = await tx.directorLedger.create({
        data: {
          transactionDate,
          amount,
          transactionType,
          debitCredit: transactionType === "OTHER_EXPENSE" ? "DEBIT" : "CREDIT",
          description,
          referenceId,
          director: { connect: { id: existing.directorId } },
          student: studentId ? { connect: { id: studentId } } : undefined,
          location: { connect: { id: userLocationId } },
          fee: { connect: { id: fee.id } },
        },
      });

      await tx.payment.create({
        data: {
          amount,
          feeId: fee.id,
          mode: "DIRECTOR",
          studentId,
          paidAt: transactionDate,
          status: "PAID",
          note: description || "Director ledger payment updated",
          transactionId: referenceId || null,
          directorLedgerId: entry.id,
        },
      });

      //to track if fee completed
      if (updatedFee.status === "PAID") {
        updatedFeeId = updatedFee.id;
      }
      //return entry
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
    //create communication log
    await addCommunicationLogEntry(
      loggedById,
      "DIRECTOR_LEDGER_ENTRY_UPDATED",
      new Date(),
      "Director ledger entry updated",
      `Director ledger entry updated by ${userName}, student changed.`,
      studentId || null,
      userLocationId,
      existing.directorId || null
    );
    //clear redis cache
    await clearRedisCache("directorLedger:*");

    return sendResponse(
      res,
      200,
      true,
      "Old entry removed and new entry created with updated student",
      newEntry
    );
  }

  // If studentId same or not linked to student
  const updatedEntry = await prisma.$transaction(async (tx) => {
    const result = await tx.directorLedger.update({
      where: { id },
      data: {
        transactionDate,
        amount,
        transactionType,
        debitCredit: transactionType === "OTHER_EXPENSE" ? "DEBIT" : "CREDIT",
        description,
        referenceId,
        director: { connect: { id: existing.directorId } },
        student: studentId
          ? { connect: { id: studentId } }
          : existing.studentId
          ? { disconnect: true }
          : undefined,
      },
    });

    // ================= BANK TRANSACTION LOGIC =================
    const wasBankType = existing.transactionType === "INSTITUTION_GAVE_BANK";
    const isBankType = transactionType === "INSTITUTION_GAVE_BANK";

    // 1. Switched TO bank payment (create new)
    if (isBankType && !wasBankType) {
      const bankTransaction = await tx.bankTransaction.create({
        data: {
          amount,
          transactionId: referenceId || null,
          transactionDate,
          transactionMode: "BANK_TRANSFER",
          transactionType: "DEBIT",
          category: "PAYMENT_TO_DIRECTOR",
          description: description || "Payment to director",
          location: { connect: { id: userLocationId } },
          director: { connect: { id: directorId } },
          bankAccount: { connect: { id: bankAccountId } },
          status: "COMPLETED",
        },
      });

      await tx.directorLedger.update({
        where: { id: result.id },
        data: { bankTransactionId: bankTransaction.id },
      });

      // Deduct money from bank
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { decrement: amount } },
      });
    }

    // 2. Bank -> Bank (update amount)
    if (isBankType && wasBankType && existing.bankTransactionId) {
      const oldAmount = existing.amount;
      const newAmount = amount;
      const difference = newAmount - oldAmount;

      await tx.bankTransaction.update({
        where: { id: existing.bankTransactionId },
        data: {
          amount,
          transactionId: referenceId || null,
          transactionDate,
          description,
          transactionMode: "BANK_TRANSFER",
          transactionType: "DEBIT",
          category: "PAYMENT_TO_DIRECTOR",
        },
      });

      if (difference !== 0) {
        await tx.bankAccount.update({
          where: { id: bankAccountId },
          data: {
            balance:
              difference > 0
                ? { decrement: difference }
                : { increment: Math.abs(difference) },
          },
        });
      }
    }

    // 3. Switched FROM bank to non-bank (reverse payment)
    if (!isBankType && wasBankType && existing.bankTransactionId) {
      await tx.bankTransaction.delete({
        where: { id: existing.bankTransactionId },
      });

      // Restore money to bank
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { balance: { increment: existing.amount } },
      });
    }
    // If linked to student, update fee and payment
    if (studentId) {
      //fetch fee linked to director ledger
      const fee = await tx.fee.findUnique({
        where: { id: existing.feeId },
        include: { payments: true },
      });

      // fetch old payment record connected to this director ledger entry
      const oldPayment = await tx.payment.findUnique({
        where: { directorLedgerId: id },
      });

      if (fee && oldPayment) {
        const updatedBalance = Math.max(
          fee.balanceAmount + oldPayment.amount - amount,
          0
        );
        const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";
        // Update fee
        const updatedFee = await tx.fee.update({
          where: { id: fee.id },
          data: {
            balanceAmount: updatedBalance,
            status: newStatus,
          },
        });
        // Update payment created based on this director ledger entry
        await tx.payment.update({
          where: { directorLedgerId: id },
          data: {
            amount,
            feeId: fee.id,
            mode: "DIRECTOR",
            studentId,
            paidAt: transactionDate,
            status: "PAID",
            note: description || "Director ledger payment updated",
            transactionId: referenceId || null,
          },
        });
        //to track if fee completed
        if (updatedFee.status === "PAID") {
          updatedFeeId = updatedFee.id;
        }
      }
    }
    return result;
  });

  if (!updatedEntry)
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
    "DIRECTOR_LEDGER_ENTRY_UPDATED",
    new Date(),
    "Director ledger entry updated",
    `Director ledger entry updated by ${userName}.`,
    studentId || null,
    userLocationId,
    existing.directorId || null
  );
  //clear redis cache
  await clearRedisCache("directorLedger:*");
  sendResponse(res, 200, true, "Entry updated successfully", updatedEntry);
});

//DELETE DIRECTOR LEDGER ENTRY----------------------------------------------------------------
export const deleteDirectorLedgerEntry = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const entry = await prisma.directorLedger.findUnique({
    where: { id },
    include: { student: { include: { fees: true } } },
  });

  if (!entry)
    return sendResponse(
      res,
      404,
      false,
      "Director ledger entry not found",
      null
    );

  // if linked to student, reverse fee and payment
  if (entry.studentId && entry.transactionType === "STUDENT_PAID") {
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Reverse fee update for old student
      if (entry.feeId) {
        const fee = await tx.fee.findUnique({
          where: { id: entry.feeId },
        });
        if (fee) {
          await tx.fee.update({
            where: { id: entry.feeId },
            data: {
              balanceAmount: fee.balanceAmount + entry.amount,
              status: "PENDING",
            },
          });

          await tx.payment.deleteMany({
            where: {
              directorLedgerId: id,
            },
          });
        }
      }

      // 2️⃣ Delete old cashbook entry
      await tx.directorLedger.delete({ where: { id } });
    });

    //clear redis cache
    await clearRedisCache("directorLedger:*");

    //create communication log
    await addCommunicationLogEntry(
      loggedById,
      "DIRECTOR_LEDGER_ENTRY_DELETED",
      new Date(),
      "Director ledger entry deleted",
      `Director ledger entry deleted by ${userName}, student changed.`,
      entry.studentId || null,
      userLocationId,
      entry.directorId || null
    );

    return sendResponse(
      res,
      200,
      true,
      "Director ledger entry deleted successfully, fee and payment reversed",
      null
    );
  }
  if (
    entry.transactionType === "INSTITUTION_GAVE_BANK" &&
    entry.bankTransactionId
  ) {
    //reverse bank transaction
    const bankTransaction = await prisma.bankTransaction.findUnique({
      where: { id: entry.bankTransactionId },
    });
    if (bankTransaction) {
      //restore bank balance
      await prisma.bankAccount.update({
        where: { id: bankTransaction.bankAccountId },
        data: {
          balance: {
            increment: bankTransaction.amount,
          },
        },
      });
      //delete bank transaction
      await prisma.bankTransaction.delete({
        where: { id: entry.bankTransactionId },
      });
    }
  }

  await prisma.directorLedger.delete({ where: { id } });

  //create communication log
  await addCommunicationLogEntry(
    loggedById,
    "DIRECTOR_LEDGER_ENTRY_DELETED",
    new Date(),
    "Director ledger entry deleted",
    `Director ledger entry deleted by ${userName}.`,
    null,
    userLocationId
  );

  //clear redis cache
  await clearRedisCache("directorLedger:*");

  sendResponse(
    res,
    200,
    true,
    "Director ledger entry deleted successfully",
    null
  );
});
