import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";
import { addCommunicationLogEntry } from "./communicationLogController.js";

//add location
export const addLocation = TryCatch(async (req, res) => {
  const { name, address } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const location = await prisma.location.create({
    data: {
      name,
      address,
    },
    include: {
      batches: true,
      users: true,
    },
  });
  //add communication log
  if (location) {
    await addCommunicationLogEntry(
      loggedById,
      "LOCATION_ADDED",
      new Date(),
      "Location added",
      `A new location has been added by ${userName}.`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Location added successfully", location);
});

//get location
export const getLocations = TryCatch(async (req, res) => {
  const locations = await prisma.location.findMany({
    include: {
      batches: true,
      users: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  sendResponse(res, 200, true, "Locations fetched successfully", locations);
});

//update location
export const updateLocation = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { name, address } = req.body;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const location = await prisma.location.update({
    where: { id: id },
    data: {
      name,
      address,
    },
  });
  //add communication log
  if (location) {
    await addCommunicationLogEntry(
      loggedById,
      "LOCATION_UPDATED",
      new Date(),
      "Location updated",
      `Location ${name} has been updated by ${userName}.`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Location updated successfully", location);
});

//delete location
export const deleteLocation = TryCatch(async (req, res) => {
  const { id } = req.params;
  const {
    userId: loggedById,
    locationId: userLocationId,
    name: userName,
  } = req.user;
  const location = await prisma.location.delete({
    where: { id: id },
  });
  //add communication log
  if (location) {
    await addCommunicationLogEntry(
      loggedById,
      "LOCATION_DELETED",
      new Date(),
      "Location deleted",
      `Location ${location.name} has been deleted by ${userName}.`,
      null,
      userLocationId
    );
  }
  sendResponse(res, 200, true, "Location deleted successfully", null);
});

//  Get Location-wise Performance
export const getLocationWiseReport = TryCatch(async (req, res) => {
  const { year, quarter, locationId } = req.query;

  // 1️ Define quarters
  const quarterMonths = {
    Q1: [1, 2, 3],
    Q2: [4, 5, 6],
    Q3: [7, 8, 9],
    Q4: [10, 11, 12],
  };

  //  Pick months based on quarter
  const months =
    quarter && quarter !== "ALL"
      ? quarterMonths[quarter]
      : Array.from({ length: 12 }, (_, i) => i + 1);

  const numericYear = parseInt(year, 10);

  // Get date range for year
  const startOfPeriod = new Date(numericYear, months[0] - 1, 1);
  const endOfPeriod = new Date(
    numericYear,
    months[months.length - 1], // next month after last in quarter
    1
  );

  //  Filter for date & location (if provided)
  const locationFilter =
    locationId && locationId !== "all" ? { id: locationId } : {};

  //  Fetch all locations (or specific one)
  const locations = await prisma.location.findMany({
    where: { ...locationFilter },
    select: {
      id: true,
      name: true,
      batches: {
        where: {
          createdAt: {
            gte: startOfPeriod,
            lt: endOfPeriod,
          },
        },
        select: {
          id: true,
          students: {
            select: { id: true },
          },
        },
      },
    },
  });

  //  For each location, compute metrics
  const report = [];

  for (const loc of locations) {
    const batchIds = loc.batches.map((b) => b.id);
    const studentIds = loc.batches.flatMap((b) => b.students.map((s) => s.id));

    // Calculate revenue
    const fees = await prisma.fee.findMany({
      where: {
        studentId: { in: studentIds },
        createdAt: { gte: startOfPeriod, lt: endOfPeriod },
      },
      select: { finalFee: true },
    });

    const payments = await prisma.payment.findMany({
      where: {
        studentId: { in: studentIds },
        createdAt: { gte: startOfPeriod, lt: endOfPeriod },
        status: "PAID",
      },
      select: { amount: true },
    });

    const totalRevenue = fees.reduce((acc, f) => acc + (f.finalFee || 0), 0);
    const totalPayments = payments.reduce((acc, p) => acc + (p.amount || 0), 0);

    report.push({
      location: loc.name,
      revenue: totalRevenue,
      //     collections: totalPayments,
      students: studentIds.length,
      batches: batchIds.length,
    });
  }

  sendResponse(res, 200, true, "Location-wise report fetched", report);
});
