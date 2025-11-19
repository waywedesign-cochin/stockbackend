import { runDueReminderCron } from "../utils/dueReminderCron.js";
import { sendResponse } from "../utils/responseHandler.js";

export default async function handler(req, res) {
  try {
    await runDueReminderCron();
    return sendResponse(res, 200, true, "Cron job executed successfully");
  } catch (err) {
    console.error("Cron error:", err);
    return sendResponse(res, 500, false, "Cron job failed", {
      error: err.message,
    });
  }
}
