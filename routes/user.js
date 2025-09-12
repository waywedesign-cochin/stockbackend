import express from "express";
import { signUp, login } from "../controllers/userController.js";

const router = express.Router();

//signup
router.post("/signup", signUp);

//login
router.post("/login", login);

export default router;
