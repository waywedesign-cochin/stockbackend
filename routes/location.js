import express from "express";
import {
  addLocation,
  deleteLocation,
  getLocations,
  getLocationWiseReport,
  updateLocation,
} from "../controllers/locationController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";
const router = express.Router();

//add location
router.post("/add-location", jwtMiddleware, addLocation);

//get location
router.get("/get-locations", getLocations);

//update location
router.put("/update-location/:id", jwtMiddleware, updateLocation);

//delete location
router.delete("/delete-location/:id", jwtMiddleware, deleteLocation);

//get location wise revenue
router.get("/locations-comparison",jwtMiddleware, getLocationWiseReport);
export default router;
