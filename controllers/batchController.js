import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";

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
  }

  sendResponse(res, 200, true, "Batch added successfully", batch);
});

//get batches
export const getBatches = TryCatch(async (req, res) => {
  const { id, location, course, status, mode, search } = req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  //batch by id
  if (id) {
    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        location: true,
        course: true,
        students: {
          select: {
            admissionNo: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
      },
    });
    if (!batch) {
      return sendResponse(res, 404, false, "Batch not found", null);
    }
    return sendResponse(res, 200, true, "Batch fetched successfully", batch);
  }
  //filters
  const where = {};
  if (location) {
    where.OR = [
      { location: { name: { contains: location, mode: "insensitive" } } },
      { locationId: location },
    ];
  }

  if (course)
    where.course = { name: { contains: course, mode: "insensitive" } };
  if (status) where.status = status;
  if (mode) where.course = { name: { contains: mode, mode: "insensitive" } };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { tutor: { contains: search, mode: "insensitive" } },
      { coordinator: { contains: search, mode: "insensitive" } },
      { course: { name: { contains: search, mode: "insensitive" } } },
      { year: { equals: parseInt(search) || undefined } },
      { location: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const totalCount = await prisma.batch.count({ where });
  const totalPages = Math.ceil(totalCount / limit);

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
        },
      },
      students: {
        select: {
          admissionNo: true,
          name: true,
          email: true,
        },
      },
      _count: {
        select: {
          students: true,
        },
      },
    },
    skip,
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
  });
  sendResponse(res, 200, true, "Batches fetched successfully", {
    batches,
    pagination: {
      currentPage: page,
      limit,
      totalPages,
      totalCount,
    },
  });
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
  await prisma.$transaction(async (tx) => {
    const batch = await prisma.batch.delete({
      where: { id },
    });

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
    return batch;
  });
  sendResponse(res, 200, true, "Batch deleted successfully", null);
});
