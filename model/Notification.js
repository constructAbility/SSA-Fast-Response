const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, 
  role: { type: String, enum: ["client", "technician", "admin"], required: true },
  title: { type: String, required: true },
  message: { type: String },
  type: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
  link: { type: String }, 
  read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
