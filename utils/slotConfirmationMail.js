import nodemailer from "nodemailer";

// Configure your email transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "midhunzz017@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Function to send modern slot booking email
export const sendSlotBookingEmail = async (fee) => {
  const student = fee?.student;
  const batch = student?.currentBatch;
  const courseName = batch?.course?.name;
  const batchName = batch?.name;
  const slotDate = new Date(batch?.startDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mailOptions = {
    from: '"SK & SL Associate Private Limited" <no-reply@sk&sl-associate-private-limited.com>',
    to: student?.email,
    subject: "🎯 Slot Booking Confirmation",
    text: `Hello ${student?.name},

Your slot has been successfully booked!

Course: ${courseName}
Batch: ${batchName}
Date: ${slotDate}

Please make sure to be available at the scheduled date.

Thank you!
SK & SL Associate Private Limited
    `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Slot Booking Confirmed!</h1>
        </div>
        <div style="padding: 20px; color: #333;">
          <p>Hello <strong>${student?.name}</strong>,</p>
          <p>Your slot has been successfully booked. Here are your details:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Course</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${courseName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Batch</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${batchName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${slotDate}</td>
            </tr>
          </table>
        
          <p style="margin-top: 20px; font-size: 14px;">We look forward to seeing you in the batch. Please make sure to be available at the scheduled date.</p>
          <p style="margin-top: 20px;">Thank you!<br/>SK & SL Associate Private Limited</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Modern slot booking email sent to ${student?.email}`);
  } catch (err) {
    console.error("Error sending slot booking email:", err);
  }
};
