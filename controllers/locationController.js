import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

//add location
export const addLocation = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Location added successfully", null);
});

//get location
export const getLocations = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Location fetched successfully", null);
});
