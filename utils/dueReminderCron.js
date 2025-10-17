import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

// Configure your email transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // e.g., smtp.gmail.com
  port: 587,
  secure: false, // true for 465
  auth: {
    user: "midhunzz017@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Function to send email
async function sendDueEmail(studentEmail, studentName, amount, dueDate) {
  const mailOptions = {
    from: '"Academy" <no-reply@academy.com>',
    to: studentEmail,
    subject: "Payment Due Reminder",
    text: `Hello ${studentName},\n\nYou have a payment of ₹${amount.toLocaleString()} due today (${dueDate.toDateString()}). Please make the payment on time.\n\nThank you!`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${studentEmail}`);
  } catch (err) {
    console.error("Error sending email:", err);
  }
}

// Cron job: runs every day at 08:00 AM
cron.schedule("0 8 * * *", async () => {
  console.log("Running daily due reminder cron job...");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Find students with due today
    const students = await prisma.student.findMany({
      where: {
        fees: {
          some: {
            payments: {
              some: {
                dueDate: {
                  gte: todayStart,
                  lte: todayEnd,
                },
                status: "PENDING", // only unpaid payments
              },
            },
          },
        },
      },
      include: {
        fees: {
          include: {
            payments: true,
          },
        },
      },
    });

    // Send emails
    for (const student of students) {
      // Find payments due today for this student
      for (const fee of student.fees) {
        for (const payment of fee.payments) {
          if (
            payment.status === "PENDING" &&
            payment.dueDate >= todayStart &&
            payment.dueDate <= todayEnd
          ) {
            await sendDueEmail(
              student.email,
              student.name,
              payment.amount,
              payment.dueDate
            );
          }
        }
      }
    }

    console.log("Daily due reminder cron job completed.");
  } catch (err) {
    console.error("Error in cron job:", err);
  }
});
