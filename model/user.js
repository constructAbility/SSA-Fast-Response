const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // 🔹 Common fields
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  image:{type:String},
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  password: { type: String },
  confirmPassword: { type: String }, // optional – not stored after hashing
  role: {
    type: String,
    enum: ["client", "technician", "admin"],
    default: "client",
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },

  // 🔹 OAuth / Social login
  googleId: String,
  facebookId: String,
  avatar: String,

  // 🔹 Common location fields
  location: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
  lastLocationUpdate: Date,

  // 🔹 Client-specific fields
  companyName: String,
  address: String,
  gstNumber: String,

  // 🔹 Technician-specific fields
  experience: Number,
  specialization: [String],
  responsibility: String,
  employeeId: String,
  availability: { type: Boolean, default: true },
  onDuty: { type: Boolean, default: false },
  ratings: { type: Number, default: 0 },
  totalJobs: { type: Number, default: 0 },
  technicianStatus: {
    type: String,
    enum: ["available", "dispatched", "working", "break", "offDuty"],
    default: "available",
  },

  // 🔹 Admin-specific fields
  department: String,
  permissions: [String],

  // 🔹 Verification
  isEmailVerified: { type: Boolean, default: false },
  emailOTP: String,
  emailOTPExpires: Date,
  phoneOTP: String,
  phoneOTPExpires: Date,
});

module.exports = mongoose.model("User", userSchema);
