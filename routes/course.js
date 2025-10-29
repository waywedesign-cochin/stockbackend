import express from "express";
import {
  addCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../controllers/courseController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//add course
router.post("/add-course", jwtMiddleware, addCourse);

//get courses
router.get("/get-courses", getCourses);

//update course
router.put("/update-course/:id", jwtMiddleware, updateCourse);

//delete course
router.delete("/delete-course/:id", jwtMiddleware, deleteCourse);

export default router;
