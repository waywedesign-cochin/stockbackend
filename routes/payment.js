import express from "express";
import {
  createPayment,
  createPaymentDue,
  deletePayment,
  editPayment,
  editPaymentDue,
  getPayment,
} from "../controllers/paymentController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//create payment
router.post("/create-payment", jwtMiddleware, createPayment);

//get payment
router.get("/get-payments/:studentId", getPayment);

//update payment
router.put("/update-payment/:paymentId", jwtMiddleware, editPayment);

//delete payment
router.delete("/delete-payment/:paymentId", jwtMiddleware, deletePayment);

//create payment due
router.post("/create-payment-due/:feeId", jwtMiddleware, createPaymentDue);

//update payment due
router.put("/update-payment-due/:paymentId", jwtMiddleware, editPaymentDue);

export default router;
