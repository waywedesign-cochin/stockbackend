import express from "express";
import {
  addDirectorLedgerEntry,
  deleteDirectorLedgerEntry,
  getDirectorLedgerEntries,
} from "../controllers/directorLedgerController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//add ledger entry
router.post("/add-entry", jwtMiddleware, addDirectorLedgerEntry);

//get ledger entries
router.get("/entries", getDirectorLedgerEntries);

//delete
router.delete("/delete-entry/:id", jwtMiddleware, deleteDirectorLedgerEntry);

export default router;
