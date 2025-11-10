// controllers/billController.js
const Bill = require('../models/Bill');
const Work = require('../models/Work');

exports.createBill = async (req, res) => {
  const { workId } = req.params;
  const { items, serviceCharge=0 , taxes = 0 } = req.body;
 
  const totalItems = items.reduce((s, it) => s + (it.price * it.qty), 0);
  const total = totalItems + serviceCharge + taxes;
  const work = await Work.findById(workId);
  if(!work) return res.status(404).send({ message: 'Work not found' });

  const bill = await Bill.create({
    workId,
    technicianId: req.user._id, 
    clientId: work.clientId,
    items,
    serviceCharge,
    taxes,
    totalAmount: total,
    status: 'sent' 
  });



  res.status(201).send({ bill });
};


exports.payBill = async (req, res) => {
  try {
    const { workId, paymentMethod, paymentStatus } = req.body;
    const clientId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.client._id) !== String(clientId))
      return res.status(403).json({ message: "Unauthorized" });

    if (work.status !== "completed")
      return res.status(400).json({ message: "Work not completed yet" });

    
    work.payment = {
      method: paymentMethod,
      status: paymentStatus || "paid",
      paidAt: new Date(),
    };
    await work.save();

    
    await sendemail(
      work.client.email,
      `Payment Confirmation - ${work.invoice.invoiceNumber}`,
      `<p>Hello ${work.client.firstName},</p>
       <p>We’ve received your payment of ₹${work.invoice.total.toFixed(2)} via ${paymentMethod.toUpperCase()}.</p>
       <p>Your final invoice is attached below.</p>`,
      work.invoice.pdfUrl
    );

    res.status(200).json({
      message: "Payment processed and final invoice sent to client email.",
      payment: work.payment,
    });
  } catch (err) {
    console.error("Payment Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};





exports.confirmManualPayment = async (req, res) => {
  try {
    const { billId, method, proofUrl } = req.body; 
    const userId = req.user._id;
    const bill = await Bill.findById(billId).populate('clientId');
    if (!bill) return res.status(404).json({ message: 'Bill not found' });

 
    if (String(bill.clientId._id) !== String(userId)) {
      
      return res.status(403).json({ message: 'Unauthorized' });
    }

    bill.status = 'paid';
   
    bill.paymentMethod = method;
    bill.paymentInfo = { proofUrl, paidAt: new Date(), manual: true };
    await bill.save();

    // generate invoice + email
    const { generateInvoicePDF } = require('../utils/generateInvoice');
    const { sendEmail } = require('../utils/sendemail');
    const { filePath, invoiceId } = await generateInvoicePDF(bill);
    bill.invoiceId = invoiceId;
    bill.invoicePdf = filePath;
    await bill.save();

    await sendEmail(bill.clientId.email, `Invoice ${invoiceId}`, `<p>Payment received.</p>`, filePath);

    res.json({ ok: true, bill });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};