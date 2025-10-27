import express from "express";
import {
  addCashbookEntry,
  deleteCashbookEntry,
  getCashbookEntries,
  updateCashbookEntry,
} from "../controllers/cashbookController.js";

const router = express.Router();

//add entry
router.post("/add-entry", addCashbookEntry);

//get entries
router.get("/entries", getCashbookEntries);

//update entry
router.put("/update-entry/:id", updateCashbookEntry);

//delete entry
router.delete("/delete-entry/:id", deleteCashbookEntry);

export default router;
