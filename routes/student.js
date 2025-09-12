import express from "express";
import {
  addStudent,
  deleteStudent,
  getStudents,
  updateStudent,
} from "../controllers/studentController.js";
const router = express.Router();

//add student
router.post("/add-student", addStudent);

//get students
router.get("/get-students", getStudents);

//update student
router.put("/update-student/:id", updateStudent);

//delete student
router.delete("/delete-student/:id", deleteStudent);

export default router;
