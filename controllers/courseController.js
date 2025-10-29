import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
//add course
export const addCourse = TryCatch(async (req, res) => {
  const { name, description, baseFee, duration, mode } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const course = await prisma.course.create({
    data: {
      name,
      description,
      baseFee,
      duration,
      mode,
    },
    include: {
      batches: true,
    },
  });
  //add communication log
  if (course) {
    await addCommunicationLogEntry(
      loggedById,
      "COURSE_ADDED",
      new Date(),
      "Course Added",
      `A new course has been added by ${userName}: ${name}`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Course added successfully", course);
});

//get courses
export const getCourses = TryCatch(async (req, res) => {
  const courses = await prisma.course.findMany({
    include: {
      batches: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  sendResponse(res, 200, true, "Courses fetched successfully", courses);
});

//update course
export const updateCourse = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const { name, description, baseFee, duration, mode, isActive } = req.body;
  const course = await prisma.course.update({
    where: { id: id },
    data: {
      name,
      description,
      baseFee,
      duration,
      mode,
      isActive,
    },
  });
  //add communication log
  if (course) {
    await addCommunicationLogEntry(
      loggedById,
      "COURSE_UPDATED",
      new Date(),
      "Course Updated",
      `Course has been updated by ${userName}: ${name}`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Course updated successfully", course);
});

//delete course
export const deleteCourse = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const course = await prisma.course.delete({
    where: { id: id },
  });
  //add communication log
  if (course) {
    await addCommunicationLogEntry(
      loggedById,
      "COURSE_DELETED",
      new Date(),
      "Course Deleted",
      `Course has been deleted by ${userName}: ${course.name}`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Course deleted successfully", null);
});
