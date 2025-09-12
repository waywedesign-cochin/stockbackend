import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

export const signUp = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "User created successfully", null);
});

export const login = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "User logged in successfully", null);
});
