import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";

//add bank transaction
export const addBankTransaction = TryCatch(async (req, res) => {
  const {
    transactionDate,
    transactionId,
    amount,
    description,
    transactionMode,
    bankAccountId,
    category,
    locationId,
    status,
  } = req.body;
  const bankTransaction = await prisma.bankTransaction.create({
    data: {
      transactionDate,
      transactionType:
        category === "OTHER_INCOME" || category === "STUDENT_PAID"
          ? "CREDIT"
          : "DEBIT",
      transactionId,
      amount,
      description,
      transactionMode,
      bankAccountId,
      locationId,
      category,
      status,
    },
  });
  if (bankTransaction) {
    if (bankTransaction.transactionType === "CREDIT") {
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          balance: {
            increment: amount,
          },
        },
      });
    } else {
      await prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });
    }
  }
  sendResponse(
    res,
    200,
    true,
    "Bank transaction added successfully",
    bankTransaction
  );
});

//get bank transactions
export const getBankTransactions = TryCatch(async (req, res) => {
  const {
    locationId,
    year,
    month,
    search,
    transactionMode,
    transactionType,
    category,
    bankAccountId,
    page,
    limit,
  } = req.query;
  const pageNumber = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 10;
  const skip = (pageNumber - 1) * pageSize;

  const periodFilter = { locationId };
  if (year) {
    if (month && month !== "ALL") {
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
  if (transactionMode) periodFilter.transactionMode = transactionMode;
  if (transactionType) periodFilter.transactionType = transactionType;
  if (category) periodFilter.category = category;
  if (bankAccountId) periodFilter.bankAccountId = bankAccountId;
  if (search) {
    periodFilter.OR = [
      { transactionId: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { transactionMode: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { status: { contains: search, mode: "insensitive" } },
      { transactionType: { contains: search, mode: "insensitive" } },
      { amount: isNaN(Number(search)) ? undefined : Number(search) },
    ];
  }
  const filtersForTotal = { locationId };
  if (year) {
    if (month && month !== "ALL") {
      filtersForTotal.transactionDate = {
        gte: new Date(year, parseInt(month, 10) - 1, 1),
        lte: new Date(year, parseInt(month, 10), 0, 23, 59, 59, 999),
      };
    } else {
      filtersForTotal.transactionDate = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59, 999),
      };
    }
  }
  // calculate total debit and credit
  const totalCredit = await prisma.bankTransaction.aggregate({
    where: { ...filtersForTotal, transactionType: "CREDIT" },
    _sum: {
      amount: true,
    },
  });
  const totalDebit = await prisma.bankTransaction.aggregate({
    where: { ...filtersForTotal, transactionType: "DEBIT" },
    _sum: {
      amount: true,
    },
  });
  const razorpayTotal = await prisma.bankTransaction.aggregate({
    where: { ...filtersForTotal, transactionMode: "RAZORPAY" },
    _sum: {
      amount: true,
    },
  });

  const totals = await prisma.bankTransaction.groupBy({
    by: ["category"],
    where: { ...periodFilter },
    _sum: { amount: true },
  });

  let otherIncome = 0;
  let otherExpense = 0;

  totals.forEach((item) => {
    if (item.category === "OTHER_INCOME") {
      otherIncome = item._sum.amount ?? 0;
    }

    if (item.category === "OTHER_EXPENSE") {
      otherExpense = item._sum.amount ?? 0;
    }
  });

  //balance
  const balance =
    (totalCredit._sum.amount || 0) - (totalDebit._sum.amount || 0);

  const totalCount = await prisma.bankTransaction.count({
    where: periodFilter,
  });
  const bankTransactions = await prisma.bankTransaction.findMany({
    where: periodFilter,
    skip,
    take: pageSize,
    orderBy: {
      transactionDate: "desc",
    },
  });

  const responseData = {
    bankTransactions,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      totalEntries: totalCount,
    },
    totals: {
      balance,
      totalCredit: totalCredit._sum.amount,
      totalDebit: totalDebit._sum.amount,
      razorpayTotal: razorpayTotal._sum.amount,
      otherIncome,
      otherExpense,
    },
  };

  sendResponse(
    res,
    200,
    true,
    "Bank transactions fetched successfully",
    responseData
  );
});

//update bank transaction
export const updateBankTransaction = TryCatch(async (req, res) => {
  const { id } = req.params;

  const {
    transactionDate,
    transactionId,
    amount,
    description,
    transactionMode,
    bankAccountId,
    category,
    locationId,
    status,
  } = req.body;

  const updatedBankTransaction = await prisma.$transaction(async (tx) => {
    const oldTx = await tx.bankTransaction.findUnique({ where: { id } });
    if (!oldTx) throw new Error("Transaction not found");

    const newType =
      category === "OTHER_INCOME" || category === "STUDENT_PAID"
        ? "CREDIT"
        : "DEBIT";

    // undo old
    await tx.bankAccount.update({
      where: { id: oldTx.bankAccountId },
      data: {
        balance: {
          increment:
            oldTx.transactionType === "CREDIT" ? -oldTx.amount : oldTx.amount,
        },
      },
    });

    // apply new
    await tx.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        balance: {
          increment: newType === "CREDIT" ? amount : -amount,
        },
      },
    });

    // update transaction
    return await tx.bankTransaction.update({
      where: { id },
      data: {
        transactionDate,
        transactionType: newType,
        transactionId,
        amount,
        description,
        transactionMode,
        bankAccountId,
        locationId,
        category,
        status,
      },
    });
  });

  sendResponse(res, 200, true, "Updated", updatedBankTransaction);
});

//delete bank transaction
export const deleteBankTransaction = TryCatch(async (req, res) => {
  const { id } = req.params;
  const bankTransaction = await prisma.bankTransaction.findUnique({
    where: { id },
  });

  if (bankTransaction) {
    // revert balance
    if (bankTransaction.transactionType === "CREDIT") {
      await prisma.bankAccount.update({
        where: { id: bankTransaction.bankAccountId },
        data: {
          balance: {
            decrement: bankTransaction.amount,
          },
        },
      });
    } else {
      await prisma.bankAccount.update({
        where: { id: bankTransaction.bankAccountId },
        data: {
          balance: {
            increment: bankTransaction.amount,
          },
        },
      });
    }
  }
  const deletedBankTransaction = await prisma.bankTransaction.delete({
    where: { id },
  });

  sendResponse(
    res,
    200,
    true,
    "Bank transaction deleted successfully",
    deletedBankTransaction
  );
});
