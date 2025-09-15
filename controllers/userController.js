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
  const user = await prisma.user.findUnique({
    where: { email },
  });
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
  sendResponse(res, 200, true, "Login successful", { user, token });
});
