
// controllers/webhookController.js
const crypto = require('crypto');
const Bill = require('../models/bill');

exports.gatewayWebhook = async (req, res) => {
  try {
    const body = req.body; 
    const signature = req.headers['x-gateway-signature']; // replace with actual header name
    const secret = process.env.GATEWAY_WEBHOOK_SECRET;

    // verify HMAC
    const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    if (expected !== signature) {
      return res.status(400).send('Invalid signature');
    }

    // handle events
    if (body.event === 'payment.captured' || body.event === 'payment_success') {
      const orderId = body.payload?.order?.id || body.payload?.payment?.order_id; // depends on gateway
      // find Bill by order id or by matching amount+client
      const bill = await Bill.findOne({ 'paymentInfo.orderId': orderId });
      if (!bill) return res.status(200).send('no bill');

      bill.status = 'paid';
      bill.paymentInfo = {
        ...bill.paymentInfo,
        paymentId: body.payload.payment.id || body.payload.payment.entity.id,
        method: body.payload.payment.method || body.payload.payment.entity.method,
        gatewayData: body.payload.payment
      };
      bill.paidAt = new Date();
      await bill.save();

      // update related Work
      const Work = require('../models/work');
      const work = await Work.findById(bill.workId);
      if (work) {
        work.payment = { method: bill.paymentInfo.method || 'online', status: 'paid', paidAt: new Date() };
        await work.save();
      }

      // generate final invoice and email (call util)
      const { generateInvoicePDF } = require('../utils/Invoice');
      const { sendEmail } = require('../utils/sendemail');
      const { filePath, invoiceId } = await generateInvoicePDF(bill);
      bill.invoiceId = invoiceId;
      bill.invoicePdf = filePath;
      await bill.save();

      await sendEmail(bill.clientId.email || body.payload.payment.buyer_email, `Invoice ${invoiceId}`, `<p>Payment received</p>`, filePath);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('webhook error', err);
    res.status(500).send('error');
  }
};
