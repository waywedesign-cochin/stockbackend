
import express from "express";
import { getPayment, recordPayment } from "../controllers/paymentController.js";
const router = express.Router();

//get payment
router.get("/get-payments/:studentId", getPayment);

//update payment
router.put("/record-payment/:paymentId", recordPayment);

export default router;