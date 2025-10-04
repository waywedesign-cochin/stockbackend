import express from "express";

import cors from "cors";

import cookieParser from "cookie-parser";

import userRouter from "./routes/user.js";

import batchRouter from "./routes/batch.js";

import locationRouter from "./routes/location.js";

import courseRouter from "./routes/course.js";

import studentRouter from "./routes/student.js";

const app = express();

// Parse JSON requests

app.use(express.json());

// Parse cookies

app.use(cookieParser());

// CORS setup (local + production)

const allowedOrigins = [
  "http://localhost:3000", // local frontend

  process.env.FRONTEND_URL || "https://stockfrontend-beryl.vercel.app", // production
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like Postman) or allowed origins

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },

    credentials: true, // <-- important to send cookies
  })
);

// Routes

app.use("/api/user", userRouter);

app.use("/api/batch", batchRouter);

app.use("/api/location", locationRouter);

app.use("/api/course", courseRouter);

app.use("/api/student", studentRouter);

// Start server

const port = process.env.PORT || 3001;

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
