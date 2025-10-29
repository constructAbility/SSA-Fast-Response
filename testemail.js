const sendEmail = require("./utils/sendemail");

(async () => {
  try {
    await sendEmail(
      "backendoffice12@gmail.com", 
      "SMTP Test via SendGrid",
      "<h2>Hello 👋, this is a SendGrid SMTP test email!</h2>"
    );
    console.log("Email test complete!");
  } catch (e) {
    console.error("Error while sending email:", e);
  }
})();
