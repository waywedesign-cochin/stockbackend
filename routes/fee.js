import express from "express";
import { getFees, updateFee } from "../controllers/feeController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//get fees
router.get("/get-fees/:studentId", getFees);

//update fee
router.put("/update-fee/:id", jwtMiddleware, updateFee);

export default router;
