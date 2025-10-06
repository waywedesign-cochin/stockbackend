import jwt from "jsonwebtoken";
import { sendResponse } from "../utils/responseHandler.js";

export const jwtMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendResponse(
      res,
      401,
      false,
      "Unauthorized: No token provided",
      null
    );
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded user data to the request
    next();
  } catch (error) {
    sendResponse(res, 401, false, "Unauthorized: Invalid token", null);
  }
};
