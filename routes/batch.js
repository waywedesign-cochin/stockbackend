import express from "express";
import {
  addBatch,
  deleteBatch,
  getBatches,
  updateBatch,
} from "../controllers/batchController.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//add batch
router.post("/add-batch", jwtMiddleware, addBatch);

//get batches
router.get("/get-batches", getBatches);

//update batch
router.put("/update-batch/:id", jwtMiddleware, updateBatch);

//delete batch
router.delete("/delete-batch/:id", jwtMiddleware, deleteBatch);

export default router;
