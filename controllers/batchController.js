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
    description
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
      description
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
  const batches = await prisma.batch.findMany({
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
  sendResponse(res, 200, true, "Batches fetched successfully", batches);
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
    description
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
      description
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
