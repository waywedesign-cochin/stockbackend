import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

//add batch
export const addBatch = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Batch added successfully", null);
});

//get batches
export const getBatches = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Batches fetched successfully", null);
});

//update batch
export const updateBatch = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Batch updated successfully", null);
});

//delete batch
export const deleteBatch = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Batch deleted successfully", null);
});
