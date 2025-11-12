const mongoose = require("mongoose");
const Schema = mongoose.Schema;


const ItemSchema = new Schema({
  name: { type: String, required: true, trim: true },
  qty: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
});

const BillSchema = new Schema(
  {
    workId: {
      type: Schema.Types.ObjectId,
      ref: "Work",
      required: true,
    },
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    
    items: {
      type: [ItemSchema],
      default: [],
    },

    
    serviceCharge: {
    type:String
    },

    taxes: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "sent", "paid", "cancelled"],
      default: "draft",
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "not_selected"],
      default: "not_selected",
    },

    
    paymentInfo: {
      type: Schema.Types.Mixed,
    },


    invoiceId: String, 
    pdfUrl: String,
    paidAt: Date,
    notes: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", BillSchema);
