import express from "express";
import {
  addDirectorLedgerEntry,
  deleteDirectorLedgerEntry,
  getDirectorLedgerEntries,
} from "../controllers/directorLedgerController.js";

const router = express.Router();

//add ledger entry
router.post("/add-entry", addDirectorLedgerEntry);

//get ledger entries
router.get("/entries", getDirectorLedgerEntries);

//delete
router.delete("/delete-entry/:id", deleteDirectorLedgerEntry);

export default router;
