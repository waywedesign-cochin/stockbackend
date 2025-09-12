import express from "express";
import {
  addCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../controllers/courseController.js";
const router = express.Router();

//add course
router.post("/add-course", addCourse);

//get courses
router.get("/get-courses", getCourses);

//update course
router.put("/update-course/:id", updateCourse);

//delete course
router.delete("/delete-course/:id", deleteCourse);

export default router;
