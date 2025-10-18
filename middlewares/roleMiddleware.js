import { sendResponse } from "../utils/responseHandler.js";

export const allowedRoles = { STAFF: 3, DIRECTOR: 2, ADMIN: 1 };
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendResponse(
        res,
        403,
        false,
        "Forbidden: You don't have enough permission to access this resource",
        null
      );
    }
    next();
  };
};
