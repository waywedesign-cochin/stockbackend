import prisma from "../config/prismaClient.js";
import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";

// create communication log
export const addCommunicationLogEntry = async (
  loggedById,
  type,
  date,
  subject,
  message,
  studentId,
  locationId,
  directorId,
  batchId

) => {
  try {
    const newEntry = await prisma.communicationLog.create({
      data: {
        loggedById,
        type,
        date,
        subject,
        message,
        studentId,
        locationId,
        directorId,
        batchId,
      },
    });

    return newEntry; // ✅ return it to the parent controller
  } catch (error) {
    console.error("Error creating communication log:", error);
    throw error; // ✅ let parent handle response
  }
};

//get communication logs by studentId,userId,locationId
export const getCommunicationLogs = TryCatch(async (req, res) => {
  const { directorId, studentId, loggedById, locationId, year, month, search } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const logFilter = { locationId };
  if (studentId) logFilter.studentId = studentId;
  if (directorId) logFilter.directorId = directorId;
  if (loggedById) logFilter.loggedById = loggedById;
  if (search) {
    logFilter.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { message: { contains: search, mode: "insensitive" } },
    ];
  }
  if (year && month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    logFilter.date = { gte: startDate, lt: endDate };
  }
  const totalCount = await prisma.communicationLog.count({ where: logFilter });
  const totalPages = Math.ceil(totalCount / limit);
  const communicationLogs = await prisma.communicationLog.findMany({
    where: logFilter,
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          admissionNo: true,
          currentBatch: {
            select: {
              id: true,
              name: true,
              location: { select: { id: true, name: true } },
            },
          },
        },
      },
      director: { select: { id: true, name: true, email: true } },
      location: { select: { id: true, name: true } },
      loggedBy: {
        select: { id: true, username: true, email: true, role: true },
      },
    },
    orderBy: {
      date: "desc",
    },
    skip,
    take: limit,
  });
  sendResponse(res, 200, true, "Communication logs fetched successfully", {
    communicationLogs,
    pagination: {
      currentPage: page,
      limit,
      totalPages,
      totalCount,
    },
  });
});

//update communication log
export const updateCommunicationLog = TryCatch(async (req, res) => {
  const { logId } = req.params;
  const { type, date, subject, message } = req.body;

  const updatedLog = await prisma.communicationLog.update({
    where: { id: logId },
    data: { type, date, subject, message },
  });

  sendResponse(
    res,
    200,
    true,
    "Communication log updated successfully",
    updatedLog
  );
});

//delete communication log
export const deleteCommunicationLog = TryCatch(async (req, res) => {
  const { logId } = req.params;

  await prisma.communicationLog.delete({
    where: { id: logId },
  });

  sendResponse(res, 200, true, "Communication log deleted successfully", null);
});
