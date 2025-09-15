import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

//add course
export const addCourse = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Course added successfully", null);
});

//get courses
export const getCourses = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Courses fetched successfully", null);
});

//update course
export const updateCourse = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Course updated successfully", null);
});

//delete course
export const deleteCourse = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Course deleted successfully", null);
});
