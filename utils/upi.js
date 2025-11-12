<<<<<<< HEAD
const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = "https://api.phonepe.com/apis/hermes"; 
const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const MERCHANT_KEY = process.env.PHONEPE_MERCHANT_KEY;


function generateSignature(body) {
  const payload = JSON.stringify(body);
  return crypto.createHmac('sha256', MERCHANT_KEY).update(payload).digest('hex');
}

module.exports = {
 
  createOrder: async ({ amount, currency, receipt, notes }) => {
    try {
      const payload = {
        merchantId: MERCHANT_ID,
        merchantOrderId: receipt,
        amount: amount * 100, 
        currency: currency || "INR",
        redirectUrl: process.env.PAYMENT_REDIRECT_URL || "https://yourwebsite.com/payment-success",
        callbackUrl: process.env.PAYMENT_CALLBACK_URL || "https://yourserver.com/webhook/gateway",
        metadata: notes || {}
      };

      const signature = generateSignature(payload);

      const response = await axios.post(`${BASE_URL}/v3/pay`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': signature
        }
      });

      if (response.data.success) {
        return {
          id: response.data.data.paymentId || receipt,
          short_url: response.data.data.paymentUrl || null,
          raw: response.data.data
        };
      } else {
        throw new Error(response.data.message || "Payment Gateway Error");
      }
    } catch (err) {
      console.error("Payment Gateway Error:", err.message || err);
      throw err;
    }
  }
};
=======
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
>>>>>>> origin/main
