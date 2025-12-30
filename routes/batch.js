import express from "express";
import {
  addBatch,
  deleteBatch,
  getBatches,
  getBatchesReport,
  getBatchStats,
  updateBatch,
} from "../controllers/batchController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//add batch
router.post("/add-batch", jwtMiddleware, addBatch);

//get batches
router.get("/get-batches", getBatches);

//get batches stats
router.get('/get-batches/stats',getBatchStats)

//update batch
router.put("/update-batch/:id", jwtMiddleware, updateBatch);

//delete batch
router.delete("/delete-batch/:id", jwtMiddleware, deleteBatch);

//get report
router.get("/batch-performance",jwtMiddleware, getBatchesReport);

export default router;
