import express from "express";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
import {
  addBankAccount,
  deleteBankAccount,
  getBankAccounts,
  updateBankAccount,
} from "../controllers/bankController.js";

const router = express.Router();

//add bank account
router.post("/add-bank-account", jwtMiddleware, addBankAccount);

//get bank accounts
router.get("/get-bank-accounts", jwtMiddleware, getBankAccounts);

//update bank account
router.put("/update-bank-account/:id", jwtMiddleware, updateBankAccount);

//delete bank account
router.delete("/delete-bank-account/:id", jwtMiddleware, deleteBankAccount);

export default router;
