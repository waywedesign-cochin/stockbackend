import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import {
  clearRedisCache,
  getRedisCache,
  setRedisCache,
} from "../utils/redisCache.js";

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
    include: {
      student: {
        include: {
          currentBatch: true,
        },
      },
    },
  });
  if (!fee) {
    return sendResponse(res, 500, false, "Failed to add fee", null);
  }

  //clear redis cache for student and revenue details
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  sendResponse(res, 200, true, "Student added and fee created successfully", {
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
    currentBatchId,
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

  let limit = req.query.limit !== undefined ? parseInt(req.query.limit) : 10;

  // If limit = 0 → take all (no pagination)
  const skip = limit === 0 ? undefined : (page - 1) * limit;
  const take = limit === 0 ? undefined : limit;

  //redis cache
  const redisKey = `students:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache");
    return sendResponse(
      res,
      200,
      true,
      "Students fetched (cached)",
      cachedResponse
    );
  }

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
    currentBatchId ||
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

      //current batch filter
      currentBatchId && { currentBatchId: currentBatchId },

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
          status: true,
          batchHistoryFrom: {
            select: {
              fromBatch: { select: { name: true } },
            },
          },
          batchHistoryTo: {
            select: {
              fromBatch: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    skip,
    take,
    orderBy: { createdAt: "desc" },
  });

  const responseData = {
    students,
    pagination: {
      currentPage: page,
      limit,
      totalCount,
      totalPages,
    },
  };

  await setRedisCache(redisKey, responseData);

  return sendResponse(
    res,
    200,
    true,
    "Students fetched successfully",
    responseData
  );
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
  //clear redis cache for student and revenue details
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");

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
  //clear redis cache for student and revenue details
  await clearRedisCache("students:*");
  await clearRedisCache("studentsRevenue:*");
  sendResponse(res, 200, true, "Student deleted successfully", null);
});

// Get Students Revenue (with relation filter)
export const getStudentsRevenue = TryCatch(async (req, res) => {
  const { year, quarter, locationId } = req.query;

  const redisKey = `studentsRevenue:${year}:${quarter}:${locationId}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache");
    return sendResponse(
      res,
      200,
      true,
      "Students revenue fetched (cached)",
      cachedResponse
    );
  }

  const quarterMonths = {
    Q1: [1, 2, 3],
    Q2: [4, 5, 6],
    Q3: [7, 8, 9],
    Q4: [10, 11, 12],
  };

  const months =
    quarter && quarter !== "ALL"
      ? quarterMonths[quarter]
      : Array.from({ length: 12 }, (_, i) => i + 1);

  const numericYear = parseInt(year, 10);

  // Date range for the given year
  const dateRange = {
    gte: new Date(numericYear, 0, 1),
    lt: new Date(numericYear + 1, 0, 1),
  };

  // Location filter through relations
  const locationFilter =
    locationId && locationId !== "all"
      ? {
          student: {
            currentBatch: {
              locationId: locationId,
            },
          },
        }
      : {};

  // --- Step 1: Fetch all *active* fees (filtered by date, location) ---
  const allFees = await prisma.fee.findMany({
    where: {
      ...locationFilter,
      createdAt: dateRange,
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { finalFee: true, createdAt: true },
  });

  // --- Step 2: Fetch all *active* payments (filtered by date, location) ---
  const allPayments = await prisma.payment.findMany({
    where: {
      ...locationFilter,
      createdAt: dateRange,
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { amount: true, status: true, createdAt: true },
  });

  // --- Step 3: Prepare monthly breakdown ---
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const monthlyData = months.map((month) => {
    const fees = allFees.filter(
      (f) => new Date(f.createdAt).getMonth() + 1 === month
    );
    const payments = allPayments.filter(
      (p) => new Date(p.createdAt).getMonth() + 1 === month
    );

    // total expected (active) fee in this month
    const revenue = fees.reduce((acc, f) => acc + (f.finalFee || 0), 0);

    // total collected (only PAID payments)
    const collections = payments
      .filter((p) => p.status === "PAID")
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    const outstanding = Math.max(revenue - collections, 0);

    return {
      month: monthNames[month - 1],
      revenue,
      collections,
      outstanding,
    };
  });

  // --- Step 4: Calculate overall totals (no date filter) ---
  const batchYearFilter = year && !isNaN(year) ? { year: Number(year) } : {};
  const allFeesNoDate = await prisma.fee.findMany({
    where: {
      ...locationFilter,
      batch: batchYearFilter,
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { finalFee: true },
  });

  const allPaymentsNoDate = await prisma.payment.findMany({
    where: {
      ...locationFilter,
      fee: {
        batch: batchYearFilter, //  match by fee.batch.year
      },
      status: "PAID",
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { amount: true },
  });

  const totalStudents = await prisma.student.count({
    where: {
      ...(locationId && locationId !== "all"
        ? { currentBatch: { locationId } }
        : {}),
      currentBatch: {
        ...batchYearFilter, //  match by batch.year
      },
    },
  });

  const totalRevenue = allFeesNoDate.reduce(
    (acc, f) => acc + (f.finalFee || 0),
    0
  );

  const totalCollections = allPaymentsNoDate.reduce(
    (acc, p) => acc + (p.amount || 0),
    0
  );

  const outstandingFees = Math.max(totalRevenue - totalCollections, 0);

  const collectionRate =
    totalRevenue > 0
      ? ((totalCollections / totalRevenue) * 100).toFixed(2)
      : "0.00";

  // --- Step 5: Calculate Revenue Growth (Month-over-Month) ---
  const selectedYear = Number(year);
  const now = new Date();
  const currentMonthIndex = now.getMonth(); // keep same month number

  // Month range but USING SELECTED YEAR
  const currentMonthStart = new Date(selectedYear, currentMonthIndex, 1);
  const nextMonthStart = new Date(selectedYear, currentMonthIndex + 1, 1);
  const prevMonthStart = new Date(selectedYear, currentMonthIndex - 1, 1);

  // Fetch fees for selected year's current month
  const currentMonthFees = await prisma.fee.findMany({
    where: {
      ...locationFilter,
      batch: batchYearFilter, // VERY IMPORTANT
      createdAt: {
        gte: currentMonthStart,
        lt: nextMonthStart,
      },
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { finalFee: true },
  });

  // Fetch fees for selected year's previous month
  const prevMonthFees = await prisma.fee.findMany({
    where: {
      ...locationFilter,
      batch: batchYearFilter,
      createdAt: {
        gte: prevMonthStart,
        lt: currentMonthStart,
      },
      NOT: { status: { in: ["CANCELLED", "INACTIVE"] } },
    },
    select: { finalFee: true },
  });

  const currentRevenue = currentMonthFees.reduce(
    (acc, f) => acc + (f.finalFee || 0),
    0
  );

  const prevRevenue = prevMonthFees.reduce(
    (acc, f) => acc + (f.finalFee || 0),
    0
  );

  // Correct growth logic
  let revenueGrowth = 0;

  if (prevRevenue === 0) {
    revenueGrowth = currentRevenue > 0 ? 100 : 0;
  } else {
    revenueGrowth = ((currentRevenue - prevRevenue) / prevRevenue) * 100;
  }

  revenueGrowth = Number(revenueGrowth.toFixed(2));

  // --- Step 6: New Admissions Count ---
  const newAdmissions = await prisma.student.count({
    where: {
      ...(locationId && locationId !== "all"
        ? { currentBatch: { locationId: locationId } }
        : {}),
      currentBatch: {
        ...batchYearFilter,
      },
      createdAt: {
        gte: currentMonthStart,
        lt: nextMonthStart,
      },
    },
  });

  // --- Step 7: Final summary ---
  const summary = {
    totalRevenue,
    totalCollections,
    totalStudents,
    outstandingFees,
    collectionRate: `${collectionRate}%`,
    revenueGrowth: `${revenueGrowth.toFixed(2)}%`,
    newAdmissions,
  };

  const responseData = {
    summary,
    monthlyData,
  };

  // cache the result for 1 hour
  await setRedisCache(redisKey, responseData, 3600);

  sendResponse(
    res,
    200,
    true,
    "Students revenue summary fetched",
    responseData
  );
});
