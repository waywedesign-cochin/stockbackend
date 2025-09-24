import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

//add batch
export const addBatch = TryCatch(async (req, res) => {
  const {
    name,
    year,
    locationId,
    courseId,
    tutor,
    coordinator,
    slotLimit,
    currentCount,
    mode,
    description,
  } = req.body;
  const batch = await prisma.batch.create({
    data: {
      name,
      year,
      locationId,
      courseId,
      tutor,
      coordinator,
      slotLimit,
      currentCount,
      mode,
      description,
    },
    include: {
      location: true,
      course: true,
      students: true,
    },
  });
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
      where: { id: id },
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
    sendResponse(res, 200, true, "Batch fetched successfully", batch);
  }
  const where = {
    location: { name: { contains: location ? location : undefined } },
    course: { name: { contains: course ? course : undefined } },
    status: status ? status : undefined,
    mode: mode ? mode : undefined,
    OR: search
      ? [
          { name: { contains: search, mode: "insensitive" } },
          { tutor: { contains: search, mode: "insensitive" } },
          { coordinator: { contains: search, mode: "insensitive" } },
          { course: { name: { contains: search, mode: "insensitive" } } },
          { year: { equals: parseInt(search) || undefined } },
          { location: { name: { contains: search, mode: "insensitive" } } },
        ]
      : undefined,
  };

  const totalCount = await prisma.batch.count({ where });
  const totalPages = Math.ceil(totalCount / limit);

  const batches = await prisma.batch.findMany({
    where,
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
    locationId,
    courseId,
    tutor,
    coordinator,
    slotLimit,
    currentCount,
    mode,
    description,
  } = req.body;
  const batch = await prisma.batch.update({
    where: { id },
    data: {
      name,
      year,
      locationId,
      courseId,
      tutor,
      coordinator,
      slotLimit,
      currentCount,
      mode,
      description,
    },
  });
  sendResponse(res, 200, true, "Batch updated successfully", batch);
});

//delete batch
export const deleteBatch = TryCatch(async (req, res) => {
  const { id } = req.params;
  const batch = await prisma.batch.delete({
    where: { id },
  });
  sendResponse(res, 200, true, "Batch deleted successfully", null);
});
