// utils/upi.js
const QRCode = require('qrcode');

exports.createUpi = async (vpa, name, amount, note) => {
  const upi = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
  const dataUrl = await QRCode.toDataURL(upi);
  return { upi, qrDataUrl: dataUrl };
};
const crypto = require("crypto");
const axios = require("axios");

const merchantId = process.env.PHONEPE_MERCHANT_ID;
const saltKey = process.env.PHONEPE_SALT_KEY;

async function createUPIRequest(orderId, amount) {
  const payload = {
    merchantId,
    transactionId: orderId,
    amount: amount * 100, // in paise
    paymentInstrument: {
      type: "UPI_INTENT",
    },
  };

  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
  const checksum = crypto
    .createHash("sha256")
    .update(base64 + "/pg/v1/pay" + saltKey)
    .digest("hex") + "###1";

  const res = await axios.post(
    "https://api.phonepe.com/apis/hermes/pg/v1/pay",
    { request: base64 },
    { headers: { "X-VERIFY": checksum, "Content-Type": "application/json" } }
  );

  return res.data;
}
