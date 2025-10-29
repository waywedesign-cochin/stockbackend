import express from "express";
import { switchBatch } from "../controllers/batchHistoryController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

router.post("/switch-batch", jwtMiddleware, switchBatch);

export default router;
