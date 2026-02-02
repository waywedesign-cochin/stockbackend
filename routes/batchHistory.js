import express from "express";
import { editBatchSwitch, switchBatch } from "../controllers/batchHistoryController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

router.post("/switch-batch", jwtMiddleware, switchBatch);

router.put("/edit-batch-switch", jwtMiddleware, editBatchSwitch);

export default router;
