import express from "express";
import {
  signUp,
  login,
  getAllUsers,
  getUser,
  updateUser,
  getCurrentUser,
  deleteUser,
  changePassword,
  forgotPassword,
  resetPassword,
} from "../controllers/userController.js";
import { jwtMiddleware } from "../middlewares/jwtMiddleware.js";

const router = express.Router();

//signup
router.post("/signup", signUp);

//login
router.post("/login", login);

//currentuser
router.get("/me", jwtMiddleware, getCurrentUser);

//get all users
router.get("/get-users", getAllUsers);

//get user by id
router.get("/get-user/:id", getUser);

//update user by id
router.put("/update-user/:id", updateUser);

//delete user
router.delete("/delete-user/:id", deleteUser);

//change password
router.post("/change-password", jwtMiddleware, changePassword);

//forgot password
router.post("/forgot-password", forgotPassword);

//reset password
router.post("/reset-password", resetPassword);

export default router;
