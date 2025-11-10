const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  technician: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serviceCharge:{type:Number},
  serviceType: { type: String, required: true },

  description: String,
  location: String,
   assignedTechnician: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  date: { type: Date, required: true },
  status: {
    type: String,
     enum: ["open", "taken", "approved", "inprogress", "completed","confirm","dispatch"],
    default: "open"
  },
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);


