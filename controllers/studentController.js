import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";

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
    referralInfo,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
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
      referralInfo,
    },
    include: {
      currentBatch: {
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
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
      studentId: student.id,
      batchId: student.currentBatchId,
    },
  });
  if (!fee) {
    return sendResponse(res, 500, false, "Failed to add fee", null);
  }

  if (student) {
    await addCommunicationLogEntry(
      loggedById,
      "STUDENT_ADDED",
      new Date(),
      "Student Added",
      `A new student ${student.name} to ${student.currentBatch.name} has been added by ${userName} and fee has been created.`,
      student.id,
      userLocationId
    );
  }

  sendResponse(res, 200, true, "Student added successfully with fee", {
    student,
    fee,
  });
});

//get student by filters
export const getStudents = TryCatch(async (req, res) => {
  const {
    id,
    search,
    isFundedAccount,
    location,
    batch,
    mode,
    status,
    course,
    switched,
    month,
    year,
    feeStatus,
    dueThisWeek,
  } = req.query;

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
                mode: true,
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
            batch: true,
            batchHistoryFrom: {
              select: {
                id: true,
                transferId: true,
                changeDate: true,
                reason: true,
                fromBatch: {
                  select: {
                    id: true,
                    name: true,
                    year: true,
                    status: true,
                    course: true,
                  },
                },
                toBatch: {
                  select: {
                    id: true,
                    name: true,
                    year: true,
                    status: true,
                    course: true,
                  },
                },
              },
            },
            batchHistoryTo: {
              select: {
                id: true,
                transferId: true,
                changeDate: true,
                reason: true,
                fromBatch: {
                  select: {
                    id: true,
                    name: true,
                    year: true,
                    status: true,
                    course: true,
                  },
                },
                toBatch: {
                  select: {
                    id: true,
                    name: true,
                    year: true,
                    status: true,
                    course: true,
                  },
                },
              },
            },
            status: true,
            payments: true,
          },
          orderBy: { createdAt: "desc" },
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
  //filter due on current week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diffToMonday = (dayOfWeek + 6) % 7; // days to subtract to get Monday
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  if (
    batch ||
    location ||
    mode ||
    status ||
    course ||
    switched ||
    month ||
    year ||
    feeStatus ||
    dueThisWeek
  ) {
    where.AND = [
      //  Batch filter — students currently in batch OR switched from/to it
      batch && {
        OR: [
          { currentBatchId: batch },
          { batchHistory: { some: { fromBatchId: batch } } },
          { batchHistory: { some: { toBatchId: batch } } },
        ],
      },

      // Location filter
      location && {
        currentBatch: {
          location: {
            OR: [
              { id: location },
              { name: { contains: location, mode: "insensitive" } },
            ],
          },
        },
      },

      // Course filter
      course && {
        currentBatch: {
          course: {
            OR: [
              { id: course },
              { name: { contains: course, mode: "insensitive" } },
            ],
          },
        },
      },

      // Mode filter
      mode && {
        currentBatch: {
          course: {
            mode,
          },
        },
      },

      // Status filter
      status && { currentBatch: { status } },
      switched === "true"
        ? {
            OR: [
              { fees: { some: { batchHistoryFrom: { some: {} } } } },
              { fees: { some: { batchHistoryTo: { some: {} } } } },
            ],
          }
        : switched === "false"
        ? {
            AND: [
              { fees: { none: { batchHistoryFrom: { some: {} } } } },
              { fees: { none: { batchHistoryTo: { some: {} } } } },
            ],
          }
        : undefined,
      (year || month) && {
        createdAt: {
          gte: month ? new Date(year, month - 1, 1) : new Date(year, 0, 1),
          lte: month
            ? new Date(year, month, 0, 23, 59, 59, 999)
            : new Date(year, 11, 31, 23, 59, 59, 999),
        },
      },

      feeStatus && {
        fees: {
          some: {
            status: feeStatus,
          },
        },
      },
      dueThisWeek && {
        payments: {
          some: {
            dueDate: { gte: weekStart, lte: weekEnd },
            status: "PENDING",
          },
        },
      },
    ].filter(Boolean);
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
              mode: true,
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
          batch: true,
          batchHistoryFrom: {
            select: {
              id: true,
              transferId: true,
              changeDate: true,
              reason: true,
              fromBatch: {
                select: {
                  id: true,
                  name: true,
                  year: true,
                  status: true,
                  course: true,
                },
              },
              toBatch: {
                select: {
                  id: true,
                  name: true,
                  year: true,
                  status: true,
                  course: true,
                },
              },
            },
          },
          batchHistoryTo: {
            select: {
              id: true,
              transferId: true,
              changeDate: true,
              reason: true,
              fromBatch: {
                select: {
                  id: true,
                  name: true,
                  year: true,
                  status: true,
                  course: true,
                },
              },
              toBatch: {
                select: {
                  id: true,
                  name: true,
                  year: true,
                  status: true,
                  course: true,
                },
              },
            },
          },
          status: true,
        },
        orderBy: { createdAt: "desc" },
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
    referralInfo,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  const existingStudent = await prisma.student.findUnique({
    where: { id: id },
    include: { currentBatch: true },
  });

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
      referralInfo,
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

  //add communication log
  if (student) {
    await addCommunicationLogEntry(
      loggedById,
      "STUDENT_UPDATED",
      new Date(),
      "Student updated",
      `Student ${student.name} (${existingStudent.currentBatch.name}) details has been updated by ${userName}.`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Student updated successfully", student);
});

//Delete student
export const deleteStudent = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const result = await prisma.$transaction(async (prisma) => {
    // Delete payments
    await prisma.payment.deleteMany({ where: { studentId: id } });

    // Delete fees
    await prisma.fee.deleteMany({ where: { studentId: id } });

    // Delete batch history
    await prisma.batchHistory.deleteMany({ where: { studentId: id } });

    // Get current batch
    const student = await prisma.student.findUnique({
      where: { id },
      select: { currentBatchId: true },
    });

    // Update batch count
    if (student) {
      await prisma.batch.update({
        where: { id: student.currentBatchId },
        data: { currentCount: { decrement: 1 } },
      });
    }

    // Delete student
    const deletedStudent = await prisma.student.delete({
      where: { id },
      include: { currentBatch: true },
    });
    return deletedStudent;
  });
  //add communication log
  if (result) {
    await addCommunicationLogEntry(
      loggedById,
      "STUDENT_DELETED",
      new Date(),
      "Student deleted",
      `Student ${result.name} (${result.currentBatch.name}) has been deleted by ${userName}.`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Student deleted successfully", null);
});
