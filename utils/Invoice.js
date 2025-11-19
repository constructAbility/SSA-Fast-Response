// utils/generateBillPDF.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateBillPDF = async (
  work,
  technician,
  client,
  serviceCharge,
  paymentMethod,
  totalAmount,
  qrBuffer,
  upiId
) => {
  return new Promise((resolve, reject) => {
    try {
     
      const invoicesFolder = path.join(__dirname, "../invoices");
      if (!fs.existsSync(invoicesFolder)) fs.mkdirSync(invoicesFolder);

      const filePath = path.join(invoicesFolder, `bill_${work._id}.pdf`);
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const pageWidth = doc.page.width;
      const pageMargin = 50;
      const usableWidth = pageWidth - pageMargin * 2;

      doc.pipe(fs.createWriteStream(filePath));

   
      const colors = {
        dark: "#222222",
        muted: "#666666",
        accent: "#3F51B5",
        line: "#DDDDDD"
      };

      const font = {
        regular: "Helvetica",
        bold: "Helvetica-Bold"
      };

      const formatCurrency = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
      const formatDate = (d) => {
        const date = d ? new Date(d) : new Date();
        return `${String(date.getDate()).padStart(2, "0")}/${String(
          date.getMonth() + 1
        ).padStart(2, "0")}/${date.getFullYear()}`;
      };

      const drawLine = (y) => {
        doc.strokeColor(colors.line)
          .lineWidth(1)
          .moveTo(pageMargin, y)
          .lineTo(pageWidth - pageMargin, y)
          .stroke();
      };

      const leftX = pageMargin;
      const rightX = pageWidth - pageMargin - 200;

      doc.fillColor(colors.dark)
        .font(font.bold)
        .fontSize(34)
        .text("Bill", leftX, pageMargin);

      doc.font(font.bold)
        .fontSize(11)
        .text("FAST RESPONSE", rightX, pageMargin, { align: "right" });

      doc.font(font.regular)
        .fontSize(10)
        .text("221B Baker Street", rightX, pageMargin + 18, { align: "right" })
        .text("London, UK", { align: "right" })
        .text("Phone: +44 20 7946 0958", { align: "right" });

      const afterHeader = pageMargin + 70;

      let leftY = afterHeader;
      let rightY = afterHeader;

      doc.font(font.bold).fontSize(12).fillColor(colors.accent).text("Billed To", leftX, leftY);
      leftY += 16;

      doc.font(font.regular).fontSize(11).fillColor(colors.dark);
      doc.text(`${client.firstName || ""} ${client.lastName || ""}`.trim() || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(client.email || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(client.phone || "N/A", leftX, leftY);
      leftY += 20;

 
      doc.font(font.bold).fontSize(12).fillColor(colors.accent).text("Technician Details", leftX, leftY);
      leftY += 16;

      doc.font(font.regular).fontSize(11).fillColor(colors.dark);
      doc.text(`${technician.firstName || ""} ${technician.lastName || ""}`.trim() || "N/A", leftX, leftY);
      leftY += 14;
      doc.text(technician.phone || "N/A", leftX, leftY);
      leftY += 14;
      technician.email && doc.text(technician.email, leftX, leftY);

  
      rightY = afterHeader;

      const metaBlock = [
        ["Bill Date", formatDate(work?.createdAt)],
        ["Bill Number", `BILL-${work.token || work._id}`],
        ["Bill Amount", formatCurrency(totalAmount)]
      ];

      metaBlock.forEach(([label, value]) => {
        doc.font(font.bold)
          .fontSize(11)
          .fillColor(colors.accent)
          .text(label, rightX, rightY, { align: "right" });
        rightY += 14;

        doc.font(font.regular)
          .fontSize(11)
          .fillColor(colors.dark)
          .text(value, rightX, rightY, { align: "right" });
        rightY += 22;
      });

      const separatorY = Math.max(leftY, rightY) + 10;
      drawLine(separatorY);

      
      let workY = separatorY + 20;

      doc.font(font.bold).fontSize(14).fillColor(colors.dark).text("Work Details", leftX, workY);
      workY += 18;

      doc.font(font.regular).fontSize(11);
      doc.text(`Work Token: ${work.token || "N/A"}`, leftX, workY);
      workY += 14;

      doc.text(`Service Type: ${work.serviceType || "N/A"}`, leftX, workY);
      workY += 20;

      drawLine(workY);
      workY += 10;

 
      const col = {
        desc: leftX,
        rate: leftX + usableWidth * 0.45,
        qty: leftX + usableWidth * 0.68,
        amount: leftX + usableWidth * 0.85
      };

      doc.font(font.bold).fontSize(11).fillColor(colors.dark);
      doc.text("DESCRIPTION", col.desc, workY);
      doc.text("RATE", col.rate, workY);
      doc.text("QTY", col.qty, workY);
      doc.text("AMOUNT", col.amount, workY);

      workY += 18;
      drawLine(workY);
      workY += 10;


      doc.font(font.regular).fontSize(11);
      doc.text(work.serviceType || "Service", col.desc, workY, { width: col.rate - col.desc - 10 });
      doc.text(formatCurrency(serviceCharge), col.rate, workY);
      doc.text("1", col.qty, workY);
      doc.text(formatCurrency(serviceCharge), col.amount, workY);

      workY += 28;

      let summaryY = workY + 10;
      const sumX = pageWidth - pageMargin - 200;

      const putSummary = (label, val, bold = false) => {
        doc.font(bold ? font.bold : font.regular).fontSize(11).fillColor(colors.dark);
        doc.text(label, sumX, summaryY);
        doc.text(val, sumX + 120, summaryY, { width: 80, align: "right" });
        summaryY += 18;
      };

      putSummary("Subtotal:", formatCurrency(serviceCharge));
      putSummary("Tax:", formatCurrency(0));
      putSummary("Total Bill:", formatCurrency(totalAmount), true);

      let payTop = Math.max(summaryY + 20, workY + 100);

      doc.font(font.bold).fontSize(12).fillColor(colors.dark).text("Payment", leftX, payTop);
      payTop += 18;

      doc.font(font.regular).fontSize(11);

      if (paymentMethod === "upi") {
        doc.text(`UPI ID: ${upiId}`, leftX, payTop);
      } else {
        doc.text("Payment Method: Cash", leftX, payTop);
      }

      const qrSize = 130;
      const qrX = pageWidth - pageMargin - qrSize;
      const qrY = payTop - 6;

      if (paymentMethod === "upi" && qrBuffer) {
        try {
          doc.image(qrBuffer, qrX, qrY, { width: qrSize });
          doc.font(font.regular).fontSize(10).fillColor(colors.muted)
            .text("Scan to Pay", qrX, qrY + qrSize + 6, { width: qrSize, align: "center" });
        } catch (_) { }
      }

     
      const footerY = qrY + qrSize + 40;
      drawLine(footerY);

      doc.font(font.regular).fontSize(10).fillColor(colors.muted)
        .text("Thank you for choosing Fast Response!", leftX, footerY + 14)
        .text("Please clear your bill promptly.", leftX, footerY + 30);

      doc.end();
      resolve({ filePath });

    } catch (err) {
      reject(err);
    }
  });
};
