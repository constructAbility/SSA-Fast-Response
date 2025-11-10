// utils/generateBill.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateBillPDF = async (work, technician, client, items, serviceCharge, paymentMethod) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const fileName = `bill_${work._id}.pdf`;
      const filePath = path.join(__dirname, "../invoices", fileName);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const total = subtotal + serviceCharge;

      // 🧾 Header
      doc.fontSize(18).text("🧾 Service Bill", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text(`Client: ${client.firstName} ${client.lastName}`);
      doc.text(`Technician: ${technician.firstName} ${technician.lastName}`);
      doc.text(`Work ID: ${work._id}`);
      doc.moveDown();

      // 📦 Items Table
      doc.fontSize(14).text("Items Used:");
      doc.moveDown(0.5);

      items.forEach((item, i) => {
        doc.fontSize(12).text(`${i + 1}. ${item.name} — Qty: ${item.quantity} × ₹${item.price} = ₹${item.price * item.quantity}`);
      });

      doc.moveDown();
      doc.fontSize(12).text(`Service Charge: ₹${serviceCharge}`);
      doc.text(`Total Amount: ₹${total}`, { underline: true });
      doc.moveDown();

      // 💳 Payment Section
      if (paymentMethod === "cash") {
        doc.fontSize(13).text("💰 Payment Method: CASH");
        doc.text("Please pay the technician in cash upon completion.");
      } else {
        // QR image path
        const qrPath = path.join(__dirname, "../assets/upi_qr.png");
        if (fs.existsSync(qrPath)) {
          doc.image(qrPath, { fit: [120, 120], align: "center" });
        }
        doc.moveDown();
        doc.text(`Payment Method: UPI`);
        doc.text(`UPI ID: yourshop@upi`);
      }

      doc.moveDown();
      doc.fontSize(10).text("Thank you for using our service!", { align: "center" });

      doc.end();
      writeStream.on("finish", () => resolve({ filePath, total }));
      writeStream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
};
