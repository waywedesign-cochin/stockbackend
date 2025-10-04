import prisma from "../prismaClient.js";
import { sendResponse } from "../utils/responseHandler.js";
import { TryCatch } from "../utils/TryCatch.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
//signup
export const signUp = TryCatch(async (req, res) => {
  const { username, email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (user) {
    return sendResponse(res, 400, false, "User already exists", null);
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
    },
  });
  sendResponse(res, 201, true, "User created successfully", newUser);
});

export const login = TryCatch(async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return sendResponse(res, 400, false, "Invalid email or password", null);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return sendResponse(res, 400, false, "Invalid email or password", null);
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  // Send token in HTTP-only cookie
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
  
  sendResponse(res, 200, true, "Login successful", user);
});

export const logout = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  sendResponse(res, 200, true, "Logged out successfully", null);
};

// Get currently logged-in user
export const getCurrentUser = TryCatch(async (req, res) => {
  if (!req.user) {
    return sendResponse(res, 401, false, "Not authenticated", null);
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { location: true }, // include relations if needed
  });

  sendResponse(res, 200, true, "User fetched successfully", user);
});

export const getAllUsers = TryCatch(async (req, res) => {
  const users = await prisma.user.findMany({
    include: {
      location: true,
    },
  });
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
  const user = await prisma.user.update({
    where: { id },
    data: {
      username,
      email,
      password,
      role,
      locationId,
    },
  });
  sendResponse(res, 200, true, "User updated successfully", user);
});
