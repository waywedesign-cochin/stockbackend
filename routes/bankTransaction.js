import express from "express";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
import {
  addBankTransaction,
  deleteBankTransaction,
  getBankTransactions,
  updateBankTransaction,
} from "../controllers/bankTransaction.js";

const router = express.Router();

//add bank transaction
router.post("/add-bank-transaction", jwtMiddleware, addBankTransaction);

//get bank transactions
router.get("/get-bank-transactions", jwtMiddleware, getBankTransactions);

//update bank transaction
router.put(
  "/update-bank-transaction/:id",
  jwtMiddleware,
  updateBankTransaction
);

//delete bank transaction
router.delete(
  "/delete-bank-transaction/:id",
  jwtMiddleware,
  deleteBankTransaction
);

export default router;
