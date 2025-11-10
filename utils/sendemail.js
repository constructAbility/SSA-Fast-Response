const sgMail = require("@sendgrid/mail");
require("dotenv").config();

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable is missing");
}
if (!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM environment variable is missing");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);


const sendEmail = async (to, subject, html, attachments = []) => {
  if (!to) throw new Error("Recipient email is required");
  if (!subject) throw new Error("Email subject is required");
  if (!html) throw new Error("Email HTML content is required");

  const msg = {
    to,
    from: {
      name: "Fast Response",
      email: process.env.EMAIL_FROM,
    },
    subject,
    html,
  };

  // ✅ Include attachments if present
  if (attachments && attachments.length > 0) {
    msg.attachments = attachments;
  }

  try {
    const response = await sgMail.send(msg);
    console.log("✅ Email sent successfully to:", to);
    return response;
  } catch (error) {
    console.error("❌ Failed to send email:", error.response?.body || error.message);
    throw error;
  }
};

module.exports = sendEmail;
