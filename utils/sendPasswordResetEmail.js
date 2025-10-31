import nodemailer from "nodemailer";

// Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "midhunzz017@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Function to send a modern password reset email
export const sendPasswordResetEmail = async (user, resetLink) => {
  const mailOptions = {
    from: '"SK & SL Associate Private Limited" <no-reply@sk&sl-associate-private-limited.com>',
    to: user.email,
    subject: "🔒 Reset Your Password – SK & SL Associate Private Limited",
    text: `Hello ${user.name},

We received a request to reset your password.

Click the link below to reset your password:
${resetLink}

This link is valid for 15 minutes. If you did not request a password reset, you can safely ignore this email.

Thank you,
SK & SL Associate Private Limited
    `,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.08);">
        <div style="background-color: #4f46e5; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
        </div>
        <div style="padding: 24px; color: #333;">
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>We received a request to reset your password for your SK & SL Associate Private Limited account.</p>
          <p>If this was you, click the button below to securely reset your password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" target="_blank"
              style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>

          <p>If the button above doesn’t work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #f8f8ff; padding: 10px; border-radius: 6px; border: 1px solid #eee;">
            ${resetLink}
          </p>

          <p style="margin-top: 24px; font-size: 14px; color: #555;">
            This link is valid for <strong>15 minutes</strong>. If you didn’t request a password reset, you can safely ignore this email.
          </p>

          <p style="margin-top: 30px;">Thank you,<br/>SK & SL Associate Private Limited</p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${user.email}`);
  } catch (err) {
    console.error("Error sending password reset email:", err);
  }
};
