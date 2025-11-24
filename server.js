import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRouter from "./routes/user.js";
import batchRouter from "./routes/batch.js";
import locationRouter from "./routes/location.js";
import courseRouter from "./routes/course.js";
import studentRouter from "./routes/student.js";
import feeRouter from "./routes/fee.js";
import paymentRouter from "./routes/payment.js";
import batchHistoryRouter from "./routes/batchHistory.js";
import cashbookRouter from "./routes/cashbook.js";
import directorLedgerRouter from "./routes/directorLedger.js";
import communicationLogRouter from "./routes/communicationLog.js";
import bankAccountRouter from "./routes/bankAccount.js";
import { runDueReminderCron } from "./utils/dueReminderCron.js";

const app = express();

// Parse JSON requests
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// CORS setup (local + production)
const allowedOrigins = [
  "https://stockfrontend-beryl.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, //allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// Routes
app.use("/api/user", userRouter);
app.use("/api/batch", batchRouter);
app.use("/api/location", locationRouter);
app.use("/api/course", courseRouter);
app.use("/api/student", studentRouter);
app.use("/api/fee", feeRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/batch-history", batchHistoryRouter);
app.use("/api/cashbook", cashbookRouter);
app.use("/api/director-ledger", directorLedgerRouter);
app.use("/api/communication", communicationLogRouter);
app.use("/api/bank-account", bankAccountRouter);
//cron job route
app.get("/api/due-reminder", runDueReminderCron);

const port = process.env.PORT || 3001;

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
