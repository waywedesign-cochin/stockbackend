import express from "express";
import {
  addCashbookEntry,
  deleteCashbookEntry,
  getCashbookEntries,
  updateCashbookEntry,
} from "../controllers/cashbookController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//add entry
router.post("/add-entry", jwtMiddleware, addCashbookEntry);

//get entries
router.get("/entries", getCashbookEntries);

//update entry
router.put("/update-entry/:id", jwtMiddleware, updateCashbookEntry);

//delete entry
router.delete("/delete-entry/:id", jwtMiddleware, deleteCashbookEntry);

export default router;
