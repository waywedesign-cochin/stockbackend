import express from "express";
import cors from "cors";
import userRouter from "./routes/user.js";
import batchRouter from "./routes/batch.js";
import locationRouter from "./routes/location.js";
import courseRouter from "./routes/course.js";
import studentRouter from "./routes/student.js";
const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/user", userRouter);
app.use("/api/batch", batchRouter);
app.use("/api/location", locationRouter);
app.use("/api/course", courseRouter);
app.use("/api/student", studentRouter);

const port = 5000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
