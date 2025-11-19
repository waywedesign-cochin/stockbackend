import prisma from "../config/prismaClient.js";
import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../utils/sendPasswordResetEmail.js";
import {
  clearRedisCache,
  getRedisCache,
  setRedisCache,
} from "../utils/redisCache.js";
//signup
export const signUp = TryCatch(async (req, res) => {
  const { username, email, password } = req.body;
  const emailLower = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: emailLower },
  });
  if (user) {
    return sendResponse(res, 400, false, "User already exists", null);
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: {
      username,
      email: emailLower,
      password: hashedPassword,
    },
  });
  //clear redis cache
  await clearRedisCache("users:*");

  sendResponse(
    res,
    201,
    true,
    "Signup successful. Wait for admin approval.",
    newUser
  );
});

export const login = TryCatch(async (req, res) => {
  const { email, password } = req.body;
  const emailLower = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: emailLower } });
  if (!user) {
    return sendResponse(res, 400, false, "Invalid email or password", null);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return sendResponse(res, 400, false, "Invalid email or password", null);
  }

  //role check
  if (user.role === 4) {
    return sendResponse(
      res,
      403,
      false,
      "Access denied. Contact administrator.",
      null
    );
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role,
      name: user.username,
      locationId: user.locationId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  sendResponse(res, 200, true, "Login successful", { user, token });
});

// Get currently logged-in user
export const getCurrentUser = TryCatch(async (req, res) => {
  if (!req.user) {
    return sendResponse(res, 401, false, "Not authenticated", null);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { location: true }, // include relations if needed
  });

  sendResponse(res, 200, true, "User fetched successfully", user);
});

export const getAllUsers = TryCatch(async (req, res) => {
  const { role, search } = req.query;
  //redis cache
  const redisKey = `users:${JSON.stringify(req.query)}`;
  const cachedResponse = await getRedisCache(redisKey);
  if (cachedResponse) {
    console.log("📦 Serving from Redis Cache");
    return sendResponse(
      res,
      200,
      true,
      "Users fetched successfully",
      cachedResponse
    );
  }
  let whereClause = {};

  if (role && role !== "0") {
    whereClause.role = parseInt(role, 10);
  }

  if (search) {
    whereClause.OR = [
      { username: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  const users = await prisma.user.findMany({
    where: whereClause,
    include: {
      location: true,
    },
  });
  //set redis cache
  await setRedisCache(redisKey, users);
  sendResponse(res, 200, true, "Users fetched successfully", users);
});

export const getUser = TryCatch(async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      location: true,
    },
  });
  sendResponse(res, 200, true, "User fetched successfully", user);
});

export const updateUser = TryCatch(async (req, res) => {
  const { id } = req.params;
  const { username, email, password, role, locationId } = req.body;
  const emailLower = email.toLowerCase();
  const user = await prisma.user.update({
    where: { id },
    data: {
      username,
      email: emailLower,
      password,
      role,
      locationId,
    },
  });
  //redis cache
  await clearRedisCache("users:*");
  sendResponse(res, 200, true, "User updated successfully", user);
});

//delete user
export const deleteUser = TryCatch(async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.delete({
    where: { id },
  });
  await clearRedisCache("users:*");

  sendResponse(res, 200, true, "User deleted successfully", user);
});

//change password
export const changePassword = TryCatch(async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user) {
    return sendResponse(res, 404, false, "User not found", null);
  }
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    return sendResponse(res, 400, false, "Invalid current password", null);
  }
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return sendResponse(
      res,
      400,
      false,
      "New password cannot be same as old password",
      null
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
    },
  });
  sendResponse(res, 200, true, "Password changed successfully", updatedUser);
});

//forgot password
export const forgotPassword = TryCatch(async (req, res) => {
  const { email } = req.body;
  const emailLower = email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: emailLower },
  });
  if (!user) {
    return sendResponse(res, 404, false, "User not found", null);
  }
  const resetToken = crypto.randomBytes(20).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  await prisma.user.update({
    where: { email: emailLower },
    data: {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpiry,
    },
  });

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  if (resetLink) {
    sendPasswordResetEmail(user, resetLink);
  }
  sendResponse(res, 200, true, "Password reset link sent successfully", null);
});

//reset password
export const resetPassword = TryCatch(async (req, res) => {
  const { token, newPassword } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: { gte: new Date() }, // valid and not expired
    },
  });

  if (!user) {
    return sendResponse(res, 400, false, "Invalid or expired token", null);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    },
  });

  sendResponse(res, 200, true, "Password reset successful", null);
});
