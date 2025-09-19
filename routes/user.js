import express from "express";
import {
  signUp,
  login,
  getAllUsers,
  getUser,
  updateUser,
} from "../controllers/userController.js";

const router = express.Router();

//signup
router.post("/signup", signUp);

//login
router.post("/login", login);

//get all users
router.get("/get-users", getAllUsers);

//get user by id
router.get("/get-user/:id", getUser);

//update user by id
router.put("/update-user/:id", updateUser);

export default router;
