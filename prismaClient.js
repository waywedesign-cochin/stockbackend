import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["query", "error", "warn"], // optional, useful for debugging
});

export default prisma;
