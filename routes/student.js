import express from "express";
import {
  addStudent,
  deleteStudent,
  getStudents,
  updateStudent,
} from "../controllers/studentController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//add student
router.post("/add-student", jwtMiddleware, addStudent);

//get students
router.get("/get-students", getStudents);

//update student
router.put("/update-student/:id", jwtMiddleware, updateStudent);

//delete student
router.delete("/delete-student/:id", jwtMiddleware, deleteStudent);

export default router;
