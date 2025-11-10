const Work = require("../models/work");
const Bill = require("../models/bill");
const { generateInvoicePDF } = require("../utils/Invoice");
const { sendEmail } = require("../utils/sendemail");

exports.payBill = async (req, res) => {
  try {
    const { billId, paymentMethod, paymentInfo } = req.body; 
    const clientId = req.user._id;


    const bill = await Bill.findById(billId)
      .populate("clientId")
      .populate("technicianId")
      .populate("workId");

    if (!bill) return res.status(404).json({ message: "Bill not found" });
    if (String(bill.clientId._id) !== String(clientId))
      return res.status(403).json({ message: "Unauthorized" });

    if (bill.status === "paid")
      return res.status(400).json({ message: "Bill already paid" });

  
    bill.status = "paid";
    bill.paymentMethod = paymentMethod;
    bill.paymentInfo = {
      ...paymentInfo,
      paidAt: new Date(),
    };
    await bill.save();

    const work = bill.workId;
    work.payment = {
      method: paymentMethod,
      status: "paid",
      paidAt: new Date(),
    };
    await work.save();

    const { filePath, invoiceId } = await generateInvoicePDF(bill);

 
    bill.invoiceId = invoiceId;
    bill.invoicePdf = filePath;
    await bill.save();


    await sendEmail(
      bill.clientId.email,
      `Payment Received - Invoice #${invoiceId}`,
      `
        <p>Hello ${bill.clientId.firstName},</p>
        <p>We’ve received your payment of ₹${bill.totalAmount.toFixed(2)} via <b>${paymentMethod.toUpperCase()}</b>.</p>
        <p>Your final invoice is attached below.</p>
        <p>Thank you for your business!</p>
      `,
      filePath
    );

    res.status(200).json({
      message: " Payment confirmed and final invoice sent to client.",
      bill,
    });
  } catch (err) {
    console.error("Payment Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
