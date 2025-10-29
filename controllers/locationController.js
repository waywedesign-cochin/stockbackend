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
