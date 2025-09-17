import express from "express";
import {
  addLocation,
  deleteLocation,
  getLocations,
  updateLocation,
} from "../controllers/locationController.js";
const router = express.Router();

//add location
router.post("/add-location", addLocation);

//get location
router.get("/get-locations", getLocations);

//update location
router.put("/update-location/:id", updateLocation);

//delete location
router.delete("/delete-location/:id", deleteLocation);

export default router;
