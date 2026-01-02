import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";

//add bank account
export const addBankAccount = TryCatch(async (req, res) => {
  const { accountName, accountNumber, bankName, ifscCode, branch } = req.body;
  const bankAccount = await prisma.bankAccount.create({
    data: {
      accountName,
      accountNumber,
      bankName,
      ifscCode,
      branch,
    },
  });
  sendResponse(res, 200, true, "Bank account added successfully", bankAccount);
});

//get bank accounts
export const getBankAccounts = TryCatch(async (req, res) => {
  const bankAccounts = await prisma.bankAccount.findMany({
    include: {
      bankTransactions: {
        select: {
          id: true,
          amount: true,
          transactionType: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  sendResponse(
    res,
    200,
    true,
    "Bank accounts fetched successfully",
    bankAccounts
  );
});

//update bank account
export const updateBankAccount = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { accountName, accountNumber, bankName, ifscCode, branch } = req.body;

  const existingBankAccount = await prisma.bankAccount.findUnique({
    where: { id },
  });

  if (!existingBankAccount) {
    return sendResponse(res, 404, false, "Bank account not found", null);
  }

  const updatedBankAccount = await prisma.bankAccount.update({
    where: { id },
    data: {
      accountName,
      accountNumber,
      bankName,
      ifscCode,
      branch,
    },
  });

  sendResponse(
    res,
    200,
    true,
    "Bank account updated successfully",
    updatedBankAccount
  );
});

//delete bank account
export const deleteBankAccount = TryCatch(async (req, res) => {
  const { id } = req.params;
  const deletedBankAccount = await prisma.bankAccount.delete({
    where: { id },
  });
  sendResponse(
    res,
    200,
    true,
    "Bank account deleted successfully",
    deletedBankAccount
  );
});
