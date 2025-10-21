import express from "express";
import {
  createPayment,
  createPaymentDue,
  deletePayment,
  editPayment,
  editPaymentDue,
  getPayment,
} from "../controllers/paymentController.js";
const router = express.Router();

//create payment
router.post("/create-payment", createPayment);

//get payment
router.get("/get-payments/:studentId", getPayment);

//update payment
router.put("/update-payment/:paymentId", editPayment);

//delete payment
router.delete("/delete-payment/:paymentId", deletePayment);

//create payment due
router.post("/create-payment-due/:feeId", createPaymentDue);

//update payment due
router.put("/update-payment-due/:paymentId", editPaymentDue);

export default router;
