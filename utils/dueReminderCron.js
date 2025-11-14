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
    user: process.env.CLIENT_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Function to send email
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
