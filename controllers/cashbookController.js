import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

//add cashbbook entry
export const addCashbookEntry = TryCatch(async (req, res) => {
  const {
    transactionDate,
    amount,
    transactionType,
    debitCredit,
    description,
    locationId,
    referenceId,
    studentId,
  } = req.body;

  // Create cashbook entry
  const newEntry = await prisma.cashbook.create({
    data: {
      transactionDate,
      amount,
      transactionType,
      debitCredit,
      description,
      locationId,
      referenceId,
      studentId,
    },
  });

  // Update fee and payment table if its a student payment
  if (studentId && transactionType === "STUDENT_PAID") {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        fees: true,
      },
    });

    if (!student) {
      return sendResponse(res, 404, false, "Student not found");
    }

    if (!student.fees || student.fees.length === 0) {
      return sendResponse(
        res,
        400,
        false,
        "No fee record found for this student"
      );
    }

    const fee = student.fees[0]; //latest student fee

    // update fee balance and status
    const updatedBalance = Math.max(fee.balanceAmount - amount, 0);
    const newStatus = updatedBalance <= 0 ? "PAID" : "PENDING";

    // update fee and create payment record in a transaction
    await prisma.$transaction([
      prisma.fee.update({
        where: { id: fee.id },
        data: {
          balanceAmount: updatedBalance,
          status: newStatus,
        },
      }),

      prisma.payment.create({
        data: {
          amount,
          feeId: fee.id,
          mode: "CASH",
          studentId,
          paidAt: validDate,
          status: "PAID",
          note: description || "Cash payment recorded",
        },
      }),
    ]);
  }

  // respond success
  return sendResponse(
    res,
    201,
    true,
    "Cashbook entry added successfully",
    newEntry
  );
});

//get cashbook entries with filters and pagination
export const getCashbookEntries = TryCatch(async (req, res) => {
  const {
    locationId,
    month,
    year,
    search,
    transactionType,
    debitCredit,
    page,
    limit,
  } = req.query;

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
  if (debitCredit) periodFilter.debitCredit = debitCredit;
  if (transactionType) periodFilter.transactionType = transactionType;

  // ---------- Totals for all types ----------
  const totals = await prisma.cashbook.groupBy({
    by: ["transactionType"],
    where: { locationId },
    _sum: { amount: true },
  });

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
  // else openingBalance remains 0

  // ---------- Fetch Entries for Period ----------
  const entries = await prisma.cashbook.findMany({
    where: periodFilter,
    skip,
    take: pageSize,
    orderBy: { transactionDate: "desc" },
  });

  // ---------- Period Balance ----------
  let periodBalance = 0;
  const periodEntries = await prisma.cashbook.findMany({ where: periodFilter });
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

  const totalCount = await prisma.cashbook.count({ where: periodFilter });

  return res.json({
    success: true,
    data: {
      totals: {
        studentPaid:
          totals.find((t) => t.transactionType === "STUDENT_PAID")?._sum
            .amount || 0,
        officeExpense:
          totals.find((t) => t.transactionType === "OFFICE_EXPENSE")?._sum
            .amount || 0,
        ownerTaken:
          totals.find((t) => t.transactionType === "OWNER_TAKEN")?._sum
            .amount || 0,
        openingBalance,
        closingBalance,
      },
      entries,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        totalEntries: totalCount,
      },
    },
  });
});
