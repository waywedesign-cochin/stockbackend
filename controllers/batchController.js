import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../config/prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";
import {
  clearRedisCache,
  getRedisCache,
  setRedisCache,
} from "../utils/redisCache.js";

//add batch
export const addBatch = TryCatch(async (req, res) => {
  const {
    name,
    year,
    startDate,
    locationId,
    courseId,
    tutor,
    coordinator,
    slotLimit,
    currentCount,
    description,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  const batch = await prisma.$transaction(async (tx) => {
    const newBatch = await prisma.batch.create({
      data: {
        name,
        year,
        startDate: new Date(startDate),
        locationId,
        courseId,
        tutor,
        coordinator,
        slotLimit,
        currentCount,
        description,
      },
      include: {
        location: true,
        course: true,
        students: true,
      },
    });

    return newBatch;
  });
  if (batch) {
    await addCommunicationLogEntry(
      loggedById,
      "BATCH_ADDED",
      new Date(),
      "Batch Added",
      `Batch ${name} has been added by ${userName}.`,
      null,
      userLocationId,
      batch.id
    );

    //clear redis cache for batches
    await clearRedisCache("batches:*");
    await clearRedisCache("batchesReport:*");
  }
  sendResponse(res, 200, true, "Batch added successfully", batch);
});

//GET BATCHES--------------------------------------------------------
export const getBatches = TryCatch(async (req, res) => {
  const { id, location, course, status, mode, search, year } = req.query;

  // Redis cache
  const redisKey = `batches:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache");
    return sendResponse(
      res,
      200,
      true,
      "Batches fetched successfully",
      cachedResponse
    );
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  // ✅ Location required
  if (!location) {
    return sendResponse(res, 400, false, "Location is required", null);
  }

  // ===============================
  // 🧠 Base Filters
  // ===============================
  const where = {
    OR: [
      { location: { name: { contains: location, mode: "insensitive" } } },
      { locationId: location },
    ],
  };

  // Course Filters
  if (course || mode) {
    where.course = {};

    if (course) {
      where.course.name = { contains: course, mode: "insensitive" };
    }

    if (mode) {
      where.course.mode = { equals: mode }; // no "mode" option here, since it's an enum, not string
    }
  }

  //  Status filter
  if (status) where.status = status;

  // Year filter
  if (year) where.year = Number(year);

  // Search filter
  if (search) {
    where.AND = [
      {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { tutor: { contains: search, mode: "insensitive" } },
          { coordinator: { contains: search, mode: "insensitive" } },
          { course: { name: { contains: search, mode: "insensitive" } } },
          { location: { name: { contains: search, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const totalCount = await prisma.batch.count({ where });
  // ===============================
  // 📦 Fetch batches
  // ===============================
  const batches = await prisma.batch.findMany({
    where,
    include: {
      location: true,
      course: {
        select: {
          id: true,
          name: true,
          baseFee: true,
          duration: true,
          mode: true,
        },
      },
      students: {
        include: {
          fees: true,
          payments: true,
        },
      },
      _count: { select: { students: true } },
    },
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const allBatchesForLocation = await prisma.batch.findMany({
    where,
    include: {
      students: {
        include: {
          fees: true,
          payments: true,
        },
      },
    },
  });
  // ===============================
  // 💰 Calculate Revenue Data
  // ===============================
  let totalRevenue = 0;
  let activeBatches = 0;
  let totalEnrollment = 0;
  let availableSlots = 0;

  allBatchesForLocation.forEach((batch) => {
    const allFees = batch.students.flatMap((s) => s.fees);
    const allPayments = batch.students.flatMap((s) => s.payments);

    const collected = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    totalRevenue += collected;
    totalEnrollment += batch.students.length;
    if (batch.status === "ACTIVE") activeBatches++;
    availableSlots += batch.slotLimit - batch.currentCount;
  });

  const dashboardStats = {
    activeBatches,
    totalEnrollment,
    availableSlots,
    totalRevenue,
  };

  // ===============================
  // 🎯 Enhance paginated batches
  // ===============================
  const enhancedBatches = batches.map((batch) => {
    const allFees = batch.students.flatMap((s) => s.fees);
    const allPayments = batch.students.flatMap((s) => s.payments);

    const totalFee = allFees.reduce((sum, f) => sum + (f.finalFee || 0), 0);
    const collected = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const pending = totalFee - collected;

    return {
      id: batch.id,
      name: batch.name,
      year: batch.year,
      slotLimit: batch.slotLimit,
      currentCount: batch.currentCount,
      course: batch.course,
      location: batch.location,
      tutor: batch.tutor,
      coordinator: batch.coordinator,
      status: batch.status,
      enrollment: `${batch.currentCount}/${batch.slotLimit}`,
      enrollmentPercent: ((batch.currentCount / batch.slotLimit) * 100).toFixed(
        0
      ),
      totalFee,
      collected,
      pending,
    };
  });
  const responseData = {
    dashboardStats,
    batches: enhancedBatches,
    pagination: {
      currentPage: page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
    },
  };

  await setRedisCache(redisKey, responseData);

  return sendResponse(
    res,
    200,
    true,
    "Batches fetched successfully",
    responseData
  );
});

//update batch
export const updateBatch = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    year,
    startDate,
    locationId,
    courseId,
    tutor,
    coordinator,
    slotLimit,
    currentCount,
    status,
    description,
  } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;

  const batch = await prisma.$transaction(async (tx) => {
    const updatedBatch = await prisma.batch.update({
      where: { id },
      data: {
        name,
        year,
        startDate: new Date(startDate),
        locationId,
        courseId,
        tutor,
        coordinator,
        slotLimit,
        currentCount,
        status,
        description,
      },
    });

    return updatedBatch;
  });
  if (batch) {
    await addCommunicationLogEntry(
      loggedById,
      "BATCH_UPDATED",
      new Date(),
      "Batch Updated",
      `Batch ${name} has been updated by ${userName}.`,
      null,
      userLocationId,
      batch.id
    );
    //redis cache clear
    await clearRedisCache("batches:*");
  }
  sendResponse(res, 200, true, "Batch updated successfully", batch);
});

//delete batch
export const deleteBatch = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const batch = await prisma.$transaction(async (tx) => {
    const result = await prisma.batch.delete({
      where: { id },
    });

    return result;
  });
  if (batch) {
    await addCommunicationLogEntry(
      loggedById,
      "BATCH_DELETED",
      new Date(),
      "Batch Deleted",
      `Batch ${batch.name} has been deleted by ${userName}.`,
      null,
      userLocationId,
      batch.id
    );
    //redis cache clear
    await clearRedisCache("batches:*");
    await clearRedisCache("batchesReport:*");
  }
  sendResponse(res, 200, true, "Batch deleted successfully", null);
});

//get batch report
export const getBatchesReport = TryCatch(async (req, res) => {
  const { locationId, year, quarter } = req.query;

  //redis cache
  const redisKey = `batchesReport:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache");
    return sendResponse(
      res,
      200,
      true,
      "Batches report fetched (cached)",
      cachedResponse
    );
  }

  // 🧮 Define quarter months
  const quarterMonths = {
    Q1: [1, 2, 3],
    Q2: [4, 5, 6],
    Q3: [7, 8, 9],
    Q4: [10, 11, 12],
  };

  // 🗓️ Build date range based on year & quarter
  let dateFilter = {};
  if (year) {
    const months = quarter && quarter !== "ALL" ? quarterMonths[quarter] : null;
    const startDate = new Date(year, months ? months[0] - 1 : 0, 1);
    const endDate = new Date(
      year,
      months ? months[months.length - 1] : 11,
      31,
      23,
      59,
      59
    );

    dateFilter = {
      createdAt: { gte: startDate, lte: endDate },
    };
  }

  // 📦 Build base filter
  const filter = {
    status: "ACTIVE",
    ...(locationId && locationId !== "all" && { locationId }),
    ...(year && dateFilter),
  };

  // 🧠 Fetch batches
  const batches = await prisma.batch.findMany({
    where: filter,
    select: {
      id: true,
      name: true,
      slotLimit: true,
      currentCount: true,
      createdAt: true,
    },
  });

  // 📊 Format response
  const batchPerformance = batches.map((batch) => {
    const capacity = batch.slotLimit || 0;
    const enrolled = batch.currentCount || 0;
    const completionRate =
      capacity > 0 ? Number(((enrolled / capacity) * 100).toFixed(2)) : 0;

    return {
      batchName: batch.name,
      capacity,
      enrolled,
      completionRate,
    };
  });

  //redis cache
  await setRedisCache(redisKey, batchPerformance);

  sendResponse(res, 200, true, "Batch report fetched successfully", {
    batchPerformance,
  });
});
