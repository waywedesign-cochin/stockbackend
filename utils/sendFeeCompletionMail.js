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

// Function to send fee completion email
export const sendFeeCompletionEmail = async (fee) => {
  const student = fee?.student;
  const batch = student?.currentBatch;
  const courseName = batch?.course?.name;
  const batchName = batch?.name;
  const totalFee = fee?.finalFee || 0;
  const paidAmount =
    fee?.payments
      .filter((payment) => payment.status === "PAID")
      .reduce((total, payment) => total + payment.amount, 0) || 0;

  const paymentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mailOptions = {
    from: `SK & SL Associate Private Limited <no-reply@${process.env.CLIENT_EMAIL}>`,
    to: student?.email,
    subject: "✅ Fee Payment Completed Successfully",
    text: `Hello ${student?.name},

We are pleased to inform you that your course fee payment has been successfully completed.

Course: ${courseName}
Batch: ${batchName}
Total Fee: ₹${totalFee.toLocaleString()}
Amount Paid: ₹${paidAmount.toLocaleString()}
Fee Completion Date: ${paymentDate}

Your course fee has now been fully settled. If you have any further queries, feel free to contact us.

Thank you for choosing SK & SL Associate Private Limited.

Best Regards,
SK & SL Associate Private Limited
    `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <div style="background-color: #16a34a; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Fee Payment Completed</h1>
        </div>
        <div style="padding: 20px; color: #333;">
          <p>Hello <strong>${student?.name}</strong>,</p>

          <p>
  We are pleased to inform you that your course fee payment has been 
  <strong>successfully completed</strong>. Below are the payment details:</p>

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
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Fee</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">₹${totalFee.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount Paid</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">₹${paidAmount.toLocaleString()}</td>
            </tr>
         <tr>
       <td style="padding: 8px; border: 1px solid #ddd;"><strong>Fee Completion Date</strong></td>
  <td style="padding: 8px; border: 1px solid #ddd;">${paymentDate}</td>
</tr>
          </table>
     <p style="margin-top: 20px; font-size: 14px;">
   Your course fee has now been fully settled. Should you have any further queries, please feel free to contact us.
   </p>
        <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
  <p style="margin: 0; font-weight: 600;">Thank you for your trust.</p>
  <p style="margin: 6px 0 0 0; font-weight: bold;">
    SK & SL Associate Private Limited
  </p>
</div>


        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Fee completion email sent to ${student?.email}`);
  } catch (err) {
    console.error("Error sending fee completion email:", err);
  }
};
