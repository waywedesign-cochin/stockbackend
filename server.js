import express from "express";
import cors from "cors";
import userRouter from "./routes/user.js";
import batchRouter from "./routes/batch.js";
import locationRouter from "./routes/location.js";
import courseRouter from "./routes/course.js";
import studentRouter from "./routes/student.js";
import cookieParser from "cookie-parser";
const app = express();

app.use(express.json());
app.use(cookieParser())
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use("/api/user", userRouter);
app.use("/api/batch", batchRouter);
app.use("/api/location", locationRouter);
app.use("/api/course", courseRouter);
app.use("/api/student", studentRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
