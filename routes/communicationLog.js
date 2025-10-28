import express from "express";
import {
  deleteCommunicationLog,
  getCommunicationLogs,
  updateCommunicationLog,
} from "../controllers/communicationLogController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//get communication logs
router.get("/logs", getCommunicationLogs);

//update communication log
router.put("/update-log/:logId", jwtMiddleware, updateCommunicationLog);

//delete communication log
router.delete("/delete-log/:logId", jwtMiddleware, deleteCommunicationLog);

export default router;
