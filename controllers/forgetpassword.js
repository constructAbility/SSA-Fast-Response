const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../model/user");
const sendEmail = require("../utils/sendemail");


exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "No account found with this email." });

   
    const otp = crypto.randomInt(100000, 999999).toString();


    user.emailOTP = otp;
    user.emailOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    // Build email content
    const html = `
      <div style="font-family:Arial; background:#f9f9f9; padding:20px; border-radius:8px;">
        <h2 style="color:#333;">Password Reset Request</h2>
        <p>Hello <strong>${user.firstName || "User"}</strong>,</p>
        <p>Your One-Time Password (OTP) for resetting your password is:</p>
        <h1 style="background:#007bff; color:#fff; padding:10px 20px; border-radius:6px; display:inline-block;">${otp}</h1>
        <p>This OTP will expire in <b>5 minutes</b>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <hr/>
        <small style="color:#888;">© One Step Solution Team</small>
      </div>
    `;

    // Send OTP email
    await sendEmail(user.email, "Password Reset OTP - One Step Solution", html);
    console.log(`✅ Password reset OTP sent to ${user.email}`);

    res.status(200).json({
      message: "OTP sent successfully to your email.",
    });
  } catch (err) {
    console.error("❌ Forgot Password Error:", err.message);
    res.status(500).json({
      message: "Server error while sending OTP.",
    });
  }
};


exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.emailOTP || user.emailOTP !== otp)
      return res.status(400).json({ message: "Invalid OTP." });

    if (Date.now() > user.emailOTPExpires)
      return res.status(400).json({ message: "OTP expired. Please request a new one." });

    // Optional: mark email verified if needed
    user.isEmailVerified = true;
    await user.save();

    res.status(200).json({ message: "OTP verified successfully." });
  } catch (err) {
    console.error("❌ Verify OTP Error:", err.message);
    res.status(500).json({ message: "Server error during OTP verification." });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });

    if (newPassword !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.emailOTP || user.emailOTP !== otp)
      return res.status(400).json({ message: "Invalid OTP." });

    if (Date.now() > user.emailOTPExpires)
      return res.status(400).json({ message: "OTP expired. Please request again." });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP data
    user.emailOTP = undefined;
    user.emailOTPExpires = undefined;

    await user.save();

    res.status(200).json({ message: "Password reset successful. You can now log in." });
  } catch (err) {
    console.error("❌ Reset Password Error:", err.message);
    res.status(500).json({ message: "Server error during password reset." });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    await sendVerificationOTP(user, email, user.firstName);
    res.status(200).json({ message: "OTP resent successfully." });
  } catch (err) {
    console.error("Resend OTP Error:", err.message);
    res.status(500).json({ message: "Failed to resend OTP" });
  }
};
