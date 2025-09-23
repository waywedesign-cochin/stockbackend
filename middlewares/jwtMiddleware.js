import jwt from "jsonwebtoken";
import { sendResponse } from "../utils/responseHandler.js";

export const jwtMiddleware = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return sendResponse(res, 401, false, "Unauthorized: No token provided", null);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    sendResponse(res, 401, false, "Unauthorized: Invalid token", null);
  }
};
