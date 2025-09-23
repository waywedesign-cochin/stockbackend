import express from "express";
import {
  signUp,
  login,
  getAllUsers,
  getUser,
  updateUser,
  logout,
  getCurrentUser,
} from "../controllers/userController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//signup
router.post("/signup", signUp);

//login
router.post("/login", login);

//logout
router.post("/logout", logout);

//currentuser
router.get("/me",jwtMiddleware, getCurrentUser);

//get all users
router.get("/get-users", getAllUsers);

//get user by id
router.get("/get-user/:id", getUser);

//update user by id
router.put("/update-user/:id", updateUser);

export default router;
