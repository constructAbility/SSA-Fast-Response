const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  technicianId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  workId:{type:mongoose.Schema.Types.ObjectId,ref:"Work",required:true},
  serviceType: { type: String, required: true }, // e.g. "AC Repair"
  worrentystatus: {
    type: String,
    enum: ["pending", "in-progress", "completed", "cancelled"],
    default: "pending",
  },

  price: Number,
  completedAt: Date,

  // 🔹 Warranty fields
  warrantyDays: { type: Number, default: 30 }, // configurable per service
  warrantyExpiresAt: Date,
  warrantyActive: { type: Boolean, default: false },
});

serviceSchema.pre("save", function (next) {
  if (this.completedAt && !this.warrantyExpiresAt) {
    this.warrantyExpiresAt = new Date(
      this.completedAt.getTime() + this.warrantyDays * 24 * 60 * 60 * 1000
    );
    this.warrantyActive = true;
  }
  next();
});

module.exports = mongoose.model("Service", serviceSchema);
