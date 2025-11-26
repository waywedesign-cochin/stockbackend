import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";

//add bank transaction
export const addBankTransaction = TryCatch(async (req, res) => {
  const {
    transactionDate,
    transactionType,
    transactionId,
    amount,
    description,
    transactionMode,
    bankAccountId,
    category,
    locationId,
    studentId,
    directorId,
  } = req.body;
  const bankTransaction = await prisma.bankTransaction.create({
    data: {
      transactionDate,
      transactionType,
      transactionId,
      amount,
      description,
      transactionMode,
      bankAccountId,
      locationId,
      studentId,
      directorId,
      category,
      status: "PAID",
    },
  });
  if (bankTransaction) {
    await prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
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
    transactionType,
    transactionId,
    amount,
    description,
    transactionMode,
    category,
    bankAccountId,
    locationId,
    studentId,
    directorId,
  } = req.body;

  const existingBankTransaction = await prisma.bankTransaction.findUnique({
    where: { id },
  });

  if (!existingBankTransaction) {
    return sendResponse(res, 404, false, "Bank transaction not found", null);
  }

  const updatedBankTransaction = await prisma.bankTransaction.update({
    where: { id },
    data: {
      transactionDate,
      transactionType,
      transactionId,
      amount,
      description,
      transactionMode,
      category,
      bankAccountId,
      locationId,
      studentId,
      directorId,
    },
  });

  sendResponse(
    res,
    200,
    true,
    "Bank transaction updated successfully",
    updatedBankTransaction
  );
});

//delete bank transaction
export const deleteBankTransaction = TryCatch(async (req, res) => {
  const { id } = req.params;
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
