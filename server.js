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
  "https://stockfrontend-beryl.vercel.app",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // ✅ allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  })
);

// Routes

app.use("/api/user", userRouter);

app.use("/api/batch", batchRouter);

app.use("/api/location", locationRouter);

app.use("/api/course", courseRouter);

app.use("/api/student", studentRouter);

const port = process.env.PORT || 3001;

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
