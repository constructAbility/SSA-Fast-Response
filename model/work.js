const mongoose = require("mongoose");

const workSchema = new mongoose.Schema(
  {
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    serviceType: { type: String, required: true },
    specialization: [String],
    description: String,
    location: String,

    serviceCharge: { type: Number, required: true, default: 0 },

    assignedTechnician: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    coordinates: {
      lat: Number,
      lng: Number,
    },

    token: String,

    status: {
      type: String,
      enum: [
        "open",
        "taken",
        "approved",

        "reject",

        "dispatch",
        "inprogress",
        "completed",
        "confirm",
        "onhold_parts",
        "escalated",
        "rescheduled",
      ],
      default: "open",
    },

    issueType: {
      type: String,
      enum: [
        "need_parts",
        "need_specialist",

        "customer_unavailable",
        null,
      ],
      default: null,
    },

    

    beforphoto: { type: String },

    beforphoto: { type: String  },


    afterphoto: { type: String },

    
    invoice: {
      invoiceNumber: String,
      usedMaterials: [
        {
          name: String,
          quantity: Number,
          price: Number,
        },
      ],
      serviceCharge: Number,
      subtotal: Number,
      tax: Number,
      total: Number,
      pdfUrl: String,
    },

    // 💰 Reference to main bill document
    billId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
    },
          // 💰 Payment Tracking
    payment: {
      method: { type: String, enum: ["cash", "upi"], default: null },
      status: { type: String, enum: ["pending", "confirmed"], default: "pending" },
      confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // technician
      confirmedAt: { type: Date },
      paidAt: { type: Date }, // client side payment time
    },

    // 👷 Who completed the work
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    remarks: { type: String, trim: true },

    adminNotification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminNotification",
    },

    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true, // auto adds createdAt + updatedAt
  }
);

// Automatically update updatedAt before saving
workSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Work", workSchema);
