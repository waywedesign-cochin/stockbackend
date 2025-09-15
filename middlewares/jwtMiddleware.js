import { sendResponse } from "../utils/responseHandler";

export const jwtMiddleware = (req, res, next) => {
  const { authorization } = req.headers;
  if (authorization) {
    const token = authorization.split(" ")[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      sendResponse(res, 401, false, "Unauthorized: Invalid token", null);
    }
  } else {
    sendResponse(res, 401, false, "Unauthorized: No token provided", null);
  }
};
