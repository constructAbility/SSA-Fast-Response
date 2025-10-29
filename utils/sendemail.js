const nodemailer = require("nodemailer");
require("dotenv").config();

// Validate required environment variables
if (!process.env.SENDGRID_PASS) {
  throw new Error("SENDGRID_PASS environment variable is missing");
}
if (!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM environment variable is missing");
}

// Create transporter using SendGrid SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 587, // recommended port for TLS
  secure: false, // false for STARTTLS
  requireTLS: true, // enforce TLS
  auth: {
    user: "apikey", // literal string "apikey"
    pass: process.env.SENDGRID_PASS, // your SendGrid API key
  },
  tls: {
    rejectUnauthorized: false, // disable for self-signed cert issues, enable in prod if possible
  },
});

// Verify transporter connection as a Promise
const verifyTransporter = async () => {
  try {
    await transporter.verify();
    console.log("✅ Transporter verified — ready to send emails.");
  } catch (error) {
    console.error("❌ Transporter verification failed:", error);
    throw error;
  }
};

// Convert HTML to text fallback (basic)
const htmlToText = (html) => {
  return html.replace(/<(?:.|\n)*?>/gm, "") || "Your email client does not support HTML messages.";
};

// Send email function
const sendEmail = async (to, subject, html) => {
  if (!to) throw new Error("Recipient email is required");
  if (!subject) throw new Error("Email subject is required");
  if (!html) throw new Error("Email HTML content is required");

  try {
    const info = await transporter.sendMail({
      from: `"One Step Solution" <${process.env.EMAIL_FROM}>`, // verified sender
      to,
      subject,
      text: htmlToText(html),
      html,
    });

    console.log(` Email sent successfully to: ${to}`);
    console.log(` Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("❌ Failed to send email:", error.message);
    throw error;
  }
};

// Immediately verify transporter on module load (optional)
verifyTransporter().catch(() => {
  console.warn("⚠️ Please check your SMTP configuration and environment variables.");
});

module.exports = sendEmail;