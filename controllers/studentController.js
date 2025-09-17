import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

//add student
export const addStudent = TryCatch(async (req, res) => {
  const {
    admissionNo,
    name,
    email,
    phone,
    address,
    salesperson,
    currentBatchId,
  } = req.body;
  const student = await prisma.student.create({
    data: {
      admissionNo,
      name,
      email,
      phone,
      address,
      salesperson,
      currentBatchId,
    },
    include: {
      batches: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
    },
  });
  sendResponse(res, 200, true, "Student added successfully", student);
});

//get student
export const getStudents = TryCatch(async (req, res) => {
  const students = await prisma.student.findMany({
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
    },
  });
  sendResponse(res, 200, true, "Students fetched successfully", students);
});

//update student
export const updateStudent = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    admissionNo,
    name,
    email,
    phone,
    address,
    salesperson,
    currentBatchId,
  } = req.body;
  const student = await prisma.student.update({
    where: { id: id },
    data: {
      admissionNo,
      name,
      email,
      phone,
      address,
      salesperson,
      currentBatchId,
    },
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
    },
  });
  sendResponse(res, 200, true, "Student updated successfully", student);
});

//delete student
export const deleteStudent = TryCatch(async (req, res) => {
  const { id } = req.params;
  const student = await prisma.student.delete({
    where: { id: id },
  });
  sendResponse(res, 200, true, "Student deleted successfully", null);
});
