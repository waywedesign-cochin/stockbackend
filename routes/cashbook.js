import express from "express";
import {
  addCashbookEntry,
  getCashbookEntries,
} from "../controllers/cashbookController.js";

const router = express.Router();

//add entry
router.post("/add-entry", addCashbookEntry);

//get entries
router.get("/entries", getCashbookEntries);

export default router;
