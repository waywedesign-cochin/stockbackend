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
    isFundedAccount,
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
      isFundedAccount,
      currentBatchId,
    },
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
          mode: true,
          tutor: true,
          coordinator: true,
          location: true,
          course: true,
        },
      },
    },
  });
  if (student) {
    const incrementCount = await prisma.batch.update({
      where: { id: student.currentBatchId },
      data: { currentCount: { increment: 1 } },
    });
  }
  sendResponse(res, 200, true, "Student added successfully", student);
});

//get student
export const getStudents = TryCatch(async (req, res) => {
  const { id, search, isFundedAccount } = req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // Fetch by ID
  if (id) {
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        currentBatch: {
          select: {
            id: true,
            name: true,
            year: true,
            status: true,
            mode: true,
            tutor: true,
            coordinator: true,
            location: true,
            course: true,
          },
        },
      },
    });

    if (!student) {
      return sendResponse(res, 404, false, "Student not found", null);
    }

    return sendResponse(
      res,
      200,
      true,
      "Student fetched successfully",
      student
    );
  }

  //filters
  const where = {};

  if (isFundedAccount !== undefined) {
    where.isFundedAccount = isFundedAccount === "true";
  }

  if (search) {
    where.OR = [
      { admissionNo: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { salesperson: { contains: search, mode: "insensitive" } },
      { currentBatch: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  //Total count for pagination
  const totalCount = await prisma.student.count({ where });
  const totalPages = Math.ceil(totalCount / limit);

  const students = await prisma.student.findMany({
    where,
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
          mode: true,
          tutor: true,
          coordinator: true,
          location: true,
          course: true,
        },
      },
    },
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  // Send response
  return sendResponse(res, 200, true, "Students fetched successfully", {
    students,
    pagination: {
      currentPage: page,
      limit,
      totalCount,
      totalPages,
    },
  });
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
    isFundedAccount,
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
      isFundedAccount,
      currentBatchId,
    },
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
          mode: true,
          tutor: true,
          coordinator: true,
          location: true,
          course: true,
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
  if (student) {
    const decrementCount = await prisma.batch.update({
      where: { id: student.currentBatchId },
      data: { currentCount: { decrement: 1 } },
    });
  }
  sendResponse(res, 200, true, "Student deleted successfully", null);
});
