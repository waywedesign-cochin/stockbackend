import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

// Configure your email transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.CLIENT_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Your original email template (unchanged)
async function sendDueEmail(studentEmail, studentName, amount, dueDate) {
  const formattedDate = dueDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mailOptions = {
    from: `SK & SL Associate Private Limited" <no-reply@${process.env.CLIENT_EMAIL}>`,
    to: studentEmail,
    subject: "Payment Due Reminder",
    text: `Hello ${studentName},\n\nYou have a payment of ₹${amount.toLocaleString()} due on ${formattedDate}. Please make the payment on time.\n\nThank you!`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Payment Reminder</h1>
        </div>
        <div style="padding: 20px; background-color: #f9fafb;">
          <p>Hello <strong>${studentName}</strong>,</p>
          <p>This is a friendly reminder that you have a payment due:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; font-weight: bold;">Amount:</td>
              <td style="padding: 8px;">₹${amount.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; font-weight: bold;">Due Date:</td>
              <td style="padding: 8px;">${formattedDate}</td>
            </tr>
          </table>
          <p>Please ensure to make the payment on time to avoid any interruptions in your course access.</p>
          <p style="margin-top: 20px;">Thank you,<br><strong>SK & SL Associate Private Limited</strong></p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

// BATCH sending (sending 10 emails at once)
async function sendInBatches(emailList, batchSize = 10) {
  for (let i = 0; i < emailList.length; i += batchSize) {
    const batch = emailList.slice(i, i + batchSize);
    await Promise.all(
      batch.map((data) =>
        sendDueEmail(data.email, data.name, data.amount, data.dueDate)
      )
    );
  }
}

export async function runDueReminderCron() {
  console.log("Running daily due reminder cron job...");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Fetch students with dues today
    const students = await prisma.student.findMany({
      where: {
        fees: {
          some: {
            payments: {
              some: {
                dueDate: { gte: todayStart, lte: todayEnd },
                status: "PENDING",
              },
            },
          },
        },
      },
      include: {
        fees: { include: { payments: true } },
      },
    });

    // Build email list (your same logic)
    const emailList = [];

    for (const student of students) {
      for (const fee of student.fees) {
        for (const payment of fee.payments) {
          if (
            payment.status === "PENDING" &&
            payment.dueDate >= todayStart &&
            payment.dueDate <= todayEnd
          ) {
            emailList.push({
              email: student.email,
              name: student.name,
              amount: payment.amount,
              dueDate: payment.dueDate,
            });
          }
        }
      }
    }

    // Send emails in batches
    await sendInBatches(emailList);

    console.log("Daily due reminder cron job completed.");
  } catch (err) {
    console.error("Error in cron job:", err);
  }
}
