import express from "express";
import {
  addLocation,
  getLocations,
} from "../controllers/locationController.js";
const router = express.Router();

//add location
router.post("/add-location", addLocation);

//get location
router.get("/get-locations", getLocations);

export default router;
