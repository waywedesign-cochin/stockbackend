import prisma from "../prismaClient.js";
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
  const { studentId, loggedById, locationId, year, month } = req.query;

  const logFilter = { locationId };
  if (studentId) logFilter.studentId = studentId;
  if (loggedById) logFilter.loggedById = loggedById;
  if (year && month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    logFilter.date = { gte: startDate, lt: endDate };
  }

  const communicationLogs = await prisma.communicationLog.findMany({
    where: logFilter,
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          currentBatch: {
            select: {
              id: true,
              name: true,
              location: { select: { id: true, name: true } },
            },
          },
        },
      },
      location: { select: { id: true, name: true } },
      loggedBy: {
        select: { id: true, username: true, email: true, role: true },
      },
    },
    orderBy: {
      date: "desc",
    },
  });
  sendResponse(
    res,
    200,
    true,
    "Communication logs fetched successfully",
    communicationLogs
  );
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
