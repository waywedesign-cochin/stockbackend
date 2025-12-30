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
      `Batch ${name} has been created by ${userName}.`,
      null,
      userLocationId,
      null,
      batch.id
    );

    //clear redis cache for batches
    await clearRedisCache("batches:*");
    await clearRedisCache("batchesReport:*");
    await clearRedisCache("batchStats:*");
  }
  sendResponse(res, 200, true, "Batch added successfully", batch);
});

//GET BATCHES--------------------------------------------------------
export const getBatches = TryCatch(async (req, res) => {
  const { location, course, status, mode, search, year } = req.query;

  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const skip = (page - 1) * limit;

  if (!location) {
    return sendResponse(res, 400, false, "Location is required", null);
  }

  // Filters
  const where = { locationId: location };

  if (status) where.status = status;
  if (year) where.year = Number(year);

  if (course || mode) {
    where.course = {};
    if (course) where.course.id = course;
    if (mode) where.course.mode = mode;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tutor: { contains: search, mode: "insensitive" } },
      { coordinator: { contains: search, mode: "insensitive" } },
      { course: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  // Fetch batches + count for pagination
  const [batches, totalCount] = await Promise.all([
    prisma.batch.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        course: {
          select: { id: true, name: true, baseFee: true, mode: true },
        },
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.batch.count({ where }),
  ]);

  // Fetch fees for each batch
  const batchIds = batches.map((b) => b.id);
  const fees = await prisma.fee.findMany({
    where: {
      batchId: { in: batchIds },
      NOT: { status: { in: ["CANCELLED", "INACTIVE", "REFUNDED"] } },
    },
    select: {
      batchId: true,
      finalFee: true,
      payments: {
        where: { paidAt: { not: null } },
        select: { amount: true },
      },
    },
  });

  // Group fees by batch
  const feeMap = {};

  for (const fee of fees) {
    if (!feeMap[fee.batchId]) {
      feeMap[fee.batchId] = { totalFee: 0, collected: 0 };
    }

    feeMap[fee.batchId].totalFee += fee.finalFee || 0;
    feeMap[fee.batchId].collected += fee.payments.reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );
  }

  // Final batch response
  const enhancedBatches = batches.map((batch) => {
    const fee = feeMap[batch.id] || { totalFee: 0, collected: 0 };

    return {
      ...batch,
      totalFee: fee.totalFee,
      collected: fee.collected,
      pending: Math.max(fee.totalFee - fee.collected, 0),
      enrollment: `${batch.currentCount}/${batch.slotLimit}`,
      enrollmentPercent: (
        (batch.currentCount / (batch.slotLimit || 1)) *
        100
      ).toFixed(0),
    };
  });

  return sendResponse(res, 200, true, "Batches fetched successfully", {
    batches: enhancedBatches,
    pagination: {
      currentPage: page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
    },
  });
});

//Batch Stats
export const getBatchStats = TryCatch(async (req, res) => {
  const { location, year } = req.query;

  if (!location) {
    return sendResponse(res, 400, false, "Location is required", null);
  }

  const redisKey = `batchStats:${location}:${year || "all"}`;
  const cached = await getRedisCache(redisKey);

  if (cached) {
    console.log("📦 Batch stats from Redis");
    return sendResponse(res, 200, true, "Batch stats fetched", cached);
  }

  const where = { locationId: location };
  if (year) where.year = Number(year);

  const batches = await prisma.batch.findMany({
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

  let totalRevenue = 0;
  let outstandingFees = 0;
  let totalEnrollment = 0;
  let availableSlots = 0;
  let activeBatches = 0;
  let totalFees = 0;

  for (const batch of batches) {
    if (batch.status === "ACTIVE") activeBatches++;

    totalEnrollment += batch.students.length;
    availableSlots += batch.slotLimit - batch.currentCount;

    const fees = batch.students.flatMap((s) => s.fees);
    const payments = batch.students.flatMap((s) => s.payments);

    const batchFee = fees.reduce((s, f) => s + (f.finalFee || 0), 0);
    const collected = payments.reduce((s, p) => s + (p.amount || 0), 0);

    totalFees += batchFee;
    totalRevenue += collected;
    outstandingFees += batchFee - collected;
  }

  const stats = {
    activeBatches,
    totalEnrollment,
    availableSlots,
    totalRevenue,
    outstandingFees,
    totalFees,
  };

  await setRedisCache(redisKey, stats, 300); // 5 minutes TTL

  return sendResponse(res, 200, true, "Batch stats fetched", stats);
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
      null,
      batch.id
    );
    //redis cache clear
    await clearRedisCache("batches:*");
    await clearRedisCache("batchesReport:*");
    await clearRedisCache("batchStats:*");
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
      null,
      batch.id
    );
    //redis cache clear
    await clearRedisCache("batches:*");
    await clearRedisCache("batchesReport:*");
    await clearRedisCache("batchStats:*");
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
