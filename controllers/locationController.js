import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import prisma from "../prismaClient.js";

//add location
export const addLocation = TryCatch(async (req, res) => {
  const { name, address } = req.body;
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
  sendResponse(res, 200, true, "Location added successfully", location);
});

//get location
export const getLocations = TryCatch(async (req, res) => {
  const locations = await prisma.location.findMany({
    include: {
      batches: true,
      users: true,
    },
  });
  sendResponse(res, 200, true, "Locations fetched successfully", locations);
});

//update location
export const updateLocation = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { name, address } = req.body;
  const location = await prisma.location.update({
    where: { id: id },
    data: {
      name,
      address,
    },
  });
  sendResponse(res, 200, true, "Location updated successfully", location);
});

//delete location
export const deleteLocation = TryCatch(async (req, res) => {
  const { id } = req.params;
  const location = await prisma.location.delete({
    where: { id: id },
  });
  sendResponse(res, 200, true, "Location deleted successfully", null);
});
