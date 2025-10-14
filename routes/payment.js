import express from "express";
import {
  createPayment,
  createPaymentDue,
  editPayment,
  getPayment,
} from "../controllers/paymentController.js";
const router = express.Router();

//create payment
router.post("/create-payment", createPayment);

//create payment due
router.post("/create-payment-due/:feeId", createPaymentDue);

//get payment
router.get("/get-payments/:studentId", getPayment);

//update payment
router.put("/update-payment/:paymentId", editPayment);

export default router;
