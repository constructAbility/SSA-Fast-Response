const QRCode = require("qrcode");

// 👇 UPI link generate
const upiId = "7678661120@ybl"; // technician ya company ka UPI ID
const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
  technician.firstName || "Technician"
)}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent(
  `Payment for ${work.title || "Service"}`
)}`;

// 👇 Generate QR
const upiQR = await QRCode.toDataURL(upiUri);
