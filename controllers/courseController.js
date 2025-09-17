import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
//add course
export const addCourse = TryCatch(async (req, res) => {
  const { name, description, baseFee, duration } = req.body;
  const course = await prisma.course.create({
    data: {
      name,
      description,
      baseFee,
      duration,
    },
    include: {
      batches: true,
    },
  });
  sendResponse(res, 200, true, "Course added successfully", course);
});

//get courses
export const getCourses = TryCatch(async (req, res) => {
  const courses = await prisma.course.findMany({
    include: {
      batches: true,
    },
  });
  sendResponse(res, 200, true, "Courses fetched successfully", courses);
});

//update course
export const updateCourse = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { name, description, baseFee, duration } = req.body;
  const course = await prisma.course.update({
    where: { id: id },
    data: {
      name,
      description,
      baseFee,
      duration,
    },
  });
  sendResponse(res, 200, true, "Course updated successfully", course);
});

//delete course
export const deleteCourse = TryCatch(async (req, res) => {
  const { id } = req.params;
  const course = await prisma.course.delete({
    where: { id: id },
  });
  sendResponse(res, 200, true, "Course deleted successfully", null);
});
