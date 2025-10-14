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

  // 1️⃣ Create Student
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

  if (!student) {
    return sendResponse(res, 500, false, "Failed to add student", null);
  }

  //Increment current batch count
  await prisma.batch.update({
    where: { id: student.currentBatchId },
    data: { currentCount: { increment: 1 } },
  });

  //Create Fee for this student

  const baseFee = student.currentBatch.course?.baseFee || 0;

  const fee = await prisma.fee.create({
    data: {
      totalCourseFee: baseFee,
      finalFee: baseFee,
      discountAmount: 0,
      balanceAmount: null,
      feePaymentMode: null,
      studentId: student?.id,
      batchId: student?.currentBatchId,
    },
  });

  sendResponse(res, 200, true, "Student added successfully with fee", {
    student,
    fee,
  });
});

//get student by filters
export const getStudents = TryCatch(async (req, res) => {
  const { id, search, isFundedAccount, location, batch, mode, status, course } =
    req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // single student by ID
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
            location: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
            course: {
              select: {
                id: true,
                name: true,
                baseFee: true,
                duration: true,
                isActive: true,
              },
            },
          },
        },
        fees: {
          select: {
            id: true,
            totalCourseFee: true,
            advanceAmount: true,
            finalFee: true,
            discountAmount: true,
            balanceAmount: true,
            feePaymentMode: true,
            status: true,
            payments: true,
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

  // filters
  const where = {};

  if (isFundedAccount !== undefined) {
    where.isFundedAccount = isFundedAccount === "true";
  }

  // Combine Batch, Location, Mode filters (default + selected)
  if (batch || location || mode || status) {
    where.currentBatch = {
      AND: [
        batch && {
          OR: [
            { id: batch },
            { name: { contains: batch, mode: "insensitive" } },
          ],
        },
        location && {
          location: {
            OR: [
              { id: location },
              { name: { contains: location, mode: "insensitive" } },
            ],
          },
        },
        course && {
          course: {
            OR: [
              { id: course },
              { name: { contains: course, mode: "insensitive" } },
            ],
          },
        },
        mode && { course: { mode } },
        status && { status },
      ].filter(Boolean),
    };
  }

  if (search) {
    where.OR = [
      { admissionNo: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { salesperson: { contains: search, mode: "insensitive" } },
    ];
  }

  // count total for pagination
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
          location: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
          course: {
            select: {
              id: true,
              name: true,
              baseFee: true,
              duration: true,
              isActive: true,
            },
          },
        },
      },
      fees: {
        select: {
          id: true,
          totalCourseFee: true,
          finalFee: true,
          discountAmount: true,
          balanceAmount: true,
          feePaymentMode: true,
          status: true,
        },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          mode: true,
          transactionId: true,
          note: true,
          dueDate: true,
          paidAt: true,
          status: true,
        },
      },
    },
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

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

  // Delete payments
  await prisma.payment.deleteMany({
    where: { studentId: id },
  });

  // Delete fees
  await prisma.fee.deleteMany({
    where: { studentId: id },
  });

  // Update batch count
  const student = await prisma.student.findUnique({
    where: { id },
    select: { currentBatchId: true },
  });

  if (student) {
    await prisma.batch.update({
      where: { id: student.currentBatchId },
      data: { currentCount: { decrement: 1 } },
    });
  }

  // Delete student
  await prisma.student.delete({
    where: { id },
  });

  sendResponse(res, 200, true, "Student deleted successfully", null);
});
