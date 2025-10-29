const User = require("../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendemail");

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};


exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    // Check if user already exists
    let user = await User.findOne({ email });

    // If user exists and is fully registered (password + email verified)
    if (user && user.password && user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    
    if (!user) {
      user = new User({ email, firstName, lastName, phone });
    }

    const otpExpired = user.emailOTPExpires && user.emailOTPExpires < Date.now();

    if (!user.isEmailVerified || otpExpired) {
      
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.emailOTP = otp;
      user.emailOTPExpires = Date.now() + 10 * 60 * 1000; 
      await user.save();

      console.log("Sending OTP to:", email, "OTP:", otp);

      
      const html = `
        <div style="font-family:Arial; text-align:center;">
          <h2>Verify your email</h2>
          <p>Hello ${firstName || "User"},</p>
          <p>Your OTP is:</p>
          <h1>${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
        </div>
      `;

      await sendEmail(email, "Your OTP Code", html);

      return res.status(200).json({ message: "OTP sent. Verify your email to complete registration.", email });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.isEmailVerified = true;
    user.emailOTP = null;
    user.emailOTPExpires = null;
    await user.save();

    const token = generateToken(user);

    return res.status(201).json({ message: "Registered successfully.", token, user });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Registration failed. Please try again later." });
  }
};


exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "No user found with this email." });
    }

    if (!user.emailOTP || !user.emailOTPExpires) {
      return res.status(400).json({ message: "No OTP request found. Please request a new OTP." });
    }

    if (Date.now() > user.emailOTPExpires) {
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

    if (user.emailOTP !== otp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

   
    user.isEmailVerified = true;
    user.emailOTP = undefined;
    user.emailOTPExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully! You can now login." });
  } catch (err) {
    console.error("Error during email verification:", err);
    res.status(500).json({ message: "Server error during verification." });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(user);
    res.json({ message: "Login successful", token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getProfile = async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error("Profile Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

