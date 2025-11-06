import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import {
  clearRedisCache,
  getRedisCache,
  setRedisCache,
} from "../utils/redisCache.js";

//ADD DIRECTOR LEDGER ENTRY---------------------------------------------
export const addDirectorLedgerEntry = TryCatch(async (req, res) => {
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
      const updatedBalance = Math.max(fee.balanceAmount - amount, 0);
      const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

      await tx.fee.update({
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
        },
      });
    }

    return newEntry;
  });
  // final response
  if (!result) return;
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
  const { directorId, month, year, search, transactionType, page, limit } =
    req.query;
  //redis cache
  const redisKey = `directorLedger:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache(Director Ledger)");
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
  await setRedisCache(redisKey, JSON.stringify(responseData));
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
    studentId, // optional — if linked to a student
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
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
      const updatedBalance = Math.max(fee.balanceAmount - amount, 0);
      const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

      await tx.fee.update({
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
          note: description || "Director ledger payment updated",
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
        },
      });

      return entry;
    });
    if (!newEntry)
      return sendResponse(res, 400, false, "Transaction failed or incomplete");
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
  const updatedEntry = await prisma.directorLedger.update({
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

  if (!updatedEntry)
    return sendResponse(res, 400, false, "Cashbook entry update failed");
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
  if (entry.studentId) {
    await prisma.$transaction(async (tx) => {
      // 1️⃣ Reverse fee update for old student
      if (entry.student) {
        const oldFee = entry.student.fees[0];
        if (oldFee) {
          await tx.fee.update({
            where: { id: oldFee.id },
            data: {
              balanceAmount: oldFee.balanceAmount + entry.amount,
              status: "PENDING",
            },
          });

          await tx.payment.deleteMany({
            where: {
              studentId: entry.studentId,
              amount: entry.amount,
              feeId: oldFee.id,
            },
          });
        }
      }

      // 2️⃣ Delete old cashbook entry
      await tx.directorLedger.delete({ where: { id } });
    });
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
    //clear redis cache
    await clearRedisCache("directorLedger:*");
    return sendResponse(
      res,
      200,
      true,
      "Old entry removed and new entry created with updated student",
      null
    );
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
