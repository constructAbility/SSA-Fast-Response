// controllers/paymentController.js
const axios = require("axios");
const crypto = require("crypto");

exports.createPhonePeOrder = async (req, res) => {
  try {
    const { workId, amount } = req.body;

    const payload = {
      merchantId: process.env.PHONEPE_MERCHANT_ID,
      transactionId: `TXN_${Date.now()}`,
      amount: amount * 100, // in paise
      merchantUserId: "CLIENT001",
      redirectUrl: `https://yourdomain.in/payment-success?workId=${workId}`,
      callbackUrl: `https://yourdomain.in/api/webhook/gateway`,
      paymentInstrument: {
        type: "UPI_INTENT"
      }
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64");
    const checksum =
      crypto
        .createHash("sha256")
        .update(base64Payload + "/pg/v1/pay" + process.env.PHONEPE_SALT_KEY)
        .digest("hex") + "###1";

    const response = await axios.post(
      "https://api.phonepe.com/apis/hermes/pg/v1/pay",
      { request: base64Payload },
      { headers: { "X-VERIFY": checksum, "Content-Type": "application/json" } }
    );

    return res.json(response.data);
  } catch (err) {
    console.error("PhonePe Order Error:", err);
    res.status(500).json({ error: "Payment initiation failed" });
  }
};
