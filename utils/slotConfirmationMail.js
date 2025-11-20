import nodemailer from "nodemailer";

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

// Function to send updated slot booking email
export const sendSlotBookingEmail = async (fee) => {
  const student = fee?.student;
  const batch = student?.currentBatch;
  const courseName = batch?.course?.name;
  const batchName = batch?.name;
  const advanceAmount = fee?.advanceAmount || 0; // <-- added

  const slotDate = new Date(batch?.startDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mailOptions = {
    from: `SK & SL Associate Private Limited" <no-reply@${process.env.CLIENT_EMAIL}>`,
    to: student?.email,
    subject: "🎯 Admission Completed & Slot Booked Successfully",
    text: `Hello ${student?.name},

Your admission procedure has been successfully completed and your slot has been booked with the advance amount.

Course: ${courseName}
Batch: ${batchName}
Slot Date: ${slotDate}
Advance Amount: ₹${advanceAmount.toLocaleString()}

Please be available on the scheduled date.

Thank you!
SK & SL Associate Private Limited
    `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Admission Completed & Slot Booked</h1>
        </div>
        <div style="padding: 20px; color: #333;">
          <p>Hello <strong>${student?.name}</strong>,</p>

          <p>Your admission procedure is now <strong>successfully completed</strong>, and your slot has been booked using your advance amount.</p>

          <p>Here are your booking details:</p>

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
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Slot Date</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${slotDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Advance Amount</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">₹${advanceAmount.toLocaleString()}</td>
            </tr>
          </table>
        
          <p style="margin-top: 20px; font-size: 14px;">Please make sure to be available on the scheduled date as per your confirmed admission and slot booking.</p>

          <p style="margin-top: 20px;">Thank you!<br/>SK & SL Associate Private Limited</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Updated slot booking email sent to ${student?.email}`);
  } catch (err) {
    console.error("Error sending slot booking email:", err);
  }
};
