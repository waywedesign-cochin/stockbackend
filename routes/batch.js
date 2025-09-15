import express from "express";
import {
  addBatch,
  deleteBatch,
  getBatches,
  updateBatch,
} from "../controllers/batchController.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";
const router = express.Router();

//add batch
router.post("/add-batch", authorizeRoles(3), addBatch);

//get batches
router.get("/get-batches", getBatches);

//update batch
router.put("/update-batch/:id", updateBatch);

//delete batch
router.delete("/delete-batch/:id", deleteBatch);

export default router;
