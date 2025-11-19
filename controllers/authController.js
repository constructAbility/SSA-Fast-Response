const User = require("../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendemail");


const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};


const sendVerificationOTP = async (user, email, name) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailOTP = otp;
    user.emailOTPExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    const html = `
      <div style="font-family:Arial, text-align:center; background:#f9f9f9; padding:20px; border-radius:8px;">
        <h2 style="color:#333;">Email Verification</h2>
        <p>Hello <strong>${name || "User"}</strong>,</p>
        <p>Your OTP for email verification is:</p>
        <h1 style="background:#007bff; color:white; display:inline-block; padding:10px 20px; border-radius:6px;">${otp}</h1>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <hr/>
        <small style="color:#888;">© One Step Solution</small>
      </div>
    `;

    await sendEmail(email, "Your OTP Code - One Step Solution", html);
    console.log(`✅ OTP ${otp} sent to ${email}`);
  } catch (err) {
    console.error("❌ Error sending OTP email:", err.message);
    throw new Error("Failed to send OTP email. Please try again later.");
  }
};


exports.registerClient = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    let user = await User.findOne({ email });

    const hashedPassword = await bcrypt.hash(password, 10);

    if (!user) {
      user = new User({
        firstName,
        lastName,
        email,
        phone,
        role: "client",
        password: hashedPassword,
      });
    } else {
      user.set({
        firstName,
        lastName,
        phone,
        role: "client",
        password: hashedPassword,
      });
    }

    // Remove technician leftover fields
    user.specialization = undefined;
    user.experience = undefined;

    await user.save();      // important save

    await sendVerificationOTP(user, email, firstName);

    res.status(200).json({
      message: "OTP sent to your email. Verify to complete registration.",
      email,
    });

  } catch (err) {
    console.error("❌ Client registration error:", err.message);
    res.status(500).json({ message: "Registration failed. Try again later." });
  }
};

exports.registerTechnician = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
      specialization,
      experience,
      location,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    if (!specialization || !experience)
      return res.status(400).json({ message: "Specialization and experience are required." });

    let user = await User.findOne({ email });

    const hashedPassword = await bcrypt.hash(password, 10);

    const specs = Array.isArray(specialization)
      ? specialization.map((s) => s.trim().toLowerCase())
      : specialization.split(",").map((s) => s.trim().toLowerCase());

    if (!user) {
      user = new User({
        firstName,
        lastName,
        email,
        phone,
        password: hashedPassword,
        role: "technician",
        specialization: specs,
        experience,
        location,
        availability: true,
        onDuty: false,
        technicianStatus: "available",
      });
    } else {
      user.set({
        firstName,
        lastName,
        phone,
        password: hashedPassword,
        specialization: specs,
        experience,
        location,
        availability: true,
        onDuty: false,
        technicianStatus: "available",
        role: "technician",
      });
    }

    await user.save();       // <— VERY IMPORTANT

    await sendVerificationOTP(user, email, firstName);

    res.status(200).json({
      message: "Technician registration started. OTP sent to your email.",
      email,
    });

  } catch (err) {
    console.error("❌ Technician registration error:", err.message);
    res.status(500).json({ message: "Registration failed. Try again later." });
  }
};


exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required." });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "No user found with this email." });

    if (!user.emailOTP || !user.emailOTPExpires)
      return res.status(400).json({ message: "No OTP request found. Please request a new OTP." });

    if (Date.now() > user.emailOTPExpires)
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });

    if (user.emailOTP !== otp)
      return res.status(400).json({ message: "Invalid OTP." });

    user.isEmailVerified = true;
    user.emailOTP = undefined;
    user.emailOTPExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully! You can now log in." });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({ message: "Server error during verification." });
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


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials." });

    if (!user.password)
      return res.status(400).json({
        message: "This account was created via Google/Facebook or OTP login. Please use that method.",
      });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials." });

    const token = generateToken(user);
    res.json({ message: "Login successful", token, user });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
};



exports.getProfile = async (req, res) => {
  try {
  
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    let profile = {};

    if (user.role === "technician") {
      profile = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        email: user.email,
        phone: user.phone,
        location: user.location,
        specialization: user.specialization,
        experience: user.experience,

      };
    }

    
    else if (user.role === "client") {
      profile = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        email: user.email,
        phone: user.phone,
        location: user.location || "Not specified",
      };
    }

  

    res.status(200).json({
      success: true,
      profile,
    });
  } catch (err) {
    console.error("❌ Profile Fetch Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTechnicianSummary = async (req, res) => {
  try {
    const technicianId = req.user._id; 

    const works = await Work.find({ technician: technicianId })
      .populate("client", "name phone email")
      .populate("supervisor", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (err) {
    console.error("❌ Technician Summary Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technician summary",
    });
  }
};