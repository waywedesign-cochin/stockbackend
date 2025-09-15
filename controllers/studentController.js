import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

//add student
export const addStudent = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Student added successfully", null);
});

//get student
export const getStudents = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Students fetched successfully", null);
});

//update student
export const updateStudent = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Student updated successfully", null);
});

//delete student
export const deleteStudent = TryCatch(async (req, res) => {
  sendResponse(res, 200, true, "Student deleted successfully", null);
});
