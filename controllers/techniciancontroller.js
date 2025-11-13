const fs = require("fs");
const QRCode = require("qrcode");
const Work = require("../model/work");
const User = require("../model/user");
const Bill = require("../model/Bill");
const { generateBillPDF } = require("../utils/Invoice");
const sendNotification = require("../controllers/nitficationcontrollers");
const sendEmail = require("../utils/sendemail");

exports.completeWorkAndGenerateBill = async (req, res) => {
  try {
    const { workId, items = [], serviceCharge = 0, paymentMethod = "cash" } = req.body;
    const technicianId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    const technician = await User.findById(technicianId);
    const client = work.client;
    if (!client) return res.status(404).json({ message: "Client not found" });

    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const totalAmount = subtotal + Number(serviceCharge || 0);

    const bill = await Bill.create({
      workId,
      technicianId,
      clientId: client._id,
      items,
      serviceCharge,
      totalAmount,
      paymentMethod,
      status: "sent",
    });

    // 🔹 Generate UPI QR code if payment method is UPI
    let upiUri = "";
    let qrBuffer = null;
    if (paymentMethod === "upi") {
      const upiId = process.env.upi_id; // Replace with your UPI ID
      upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(technician.firstName || "Technician")}&am=${totalAmount}&cu=INR&tn=${encodeURIComponent(`Payment for ${work.title || "Service"}`)}`;
      const upiQR = await QRCode.toDataURL(upiUri);
      qrBuffer = Buffer.from(upiQR.split(",")[1], "base64");
    }

    // ✅ Generate PDF bill
    const { filePath } = await generateBillPDF(work, technician, client, items, serviceCharge, paymentMethod, totalAmount);
    const pdfBuffer = fs.readFileSync(filePath);

    // ✅ Prepare attachments
    const attachments = [];

    if (qrBuffer) {
      attachments.push({
        content: qrBuffer.toString("base64"),
        filename: "upi-qr.png",
        type: "image/png",
        disposition: "inline",
        content_id: "qr_code_cid",
      });
    }

    attachments.push({
      content: pdfBuffer.toString("base64"),
      filename: "bill.pdf",
      type: "application/pdf",
      disposition: "attachment",
    });

    // ✅ Email body
    const emailBody = `
      <p>Dear ${client.firstName || "Client"},</p>
      <p>Your service <b>${work.title || work.workType}</b> has been completed.</p>
      <p>Please find your bill attached below.</p>
      ${
        paymentMethod === "upi"
          ? `<p><b>Payment Method:</b> UPI</p>
             <p>Scan the QR below or <a href="${upiUri}">Click here to pay via UPI</a>.</p>
             <img src="cid:qr_code_cid" alt="UPI QR" style="width:200px;height:200px;" />`
          : `<p><b>Payment Method:</b> Cash — please pay the technician directly.</p>`
      }
      <p>Thank you for choosing our service.</p>
    `;

    // ✅ Send email
    await sendEmail(client.email, "🧾 Service Bill - Please Complete Payment", emailBody, attachments);

    // ✅ Update work
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;
    await work.save();

    res.status(200).json({
      message: "✅ Work completed, bill generated, and emailed successfully.",
      bill,
      upiUri: paymentMethod === "upi" ? upiUri : null,
    });
  } catch (error) {
    console.error("Error completing work:", error);
    res.status(500).json({
      message: "❌ Error completing work",
      error: error.message,
    });
  }
};
exports.getTechnicianSummary1 = async (req, res) => {
  try {
    // 🔒 Ye ID login token se aati hai (protect middleware se)
    const technicianId = req.user._id;

    // ✅ Status-based counts (sirf us technician ke)
    const completedCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: "completed",
    });

    const inProgressCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["inprogress", "confirm"] },
    });

    const upcomingCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["approved", "dispatch", "taken"] },
    });

    const onHoldCount = await Work.countDocuments({
      assignedTechnician: technicianId,
      status: { $in: ["onhold_parts", "rescheduled", "escalated"] },
    });

    // 💰 Total earnings (sirf apne completed works ke)
    const completedWorks = await Work.find({
      assignedTechnician: technicianId,
      status: "completed",
    });

    const totalEarnings = completedWorks.reduce((sum, work) => {
      const invoiceTotal = work.invoice?.total || 0;
      const serviceCharge = work.serviceCharge || 0;
      return sum + invoiceTotal + serviceCharge;
    }, 0);

    // 🧾 Send Response
    res.status(200).json({
      technicianId,
      summary: {
        completed: completedCount,
        inProgress: inProgressCount,
        upcoming: upcomingCount,
        onHold: onHoldCount,
        totalEarnings,
      },
    });
  } catch (error) {
    console.error("Error fetching technician summary:", error);
    res.status(500).json({
      message: "Error fetching technician summary",
      error: error.message,
    });
  }
};

exports.getTechnicianSummary = async (req, res) => {
  try {
    const technicianId = req.user._id;

    const works = await Work.find({ technician: technicianId })
      .populate("client", "name phone email")
      .populate("supervisor", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (err) {
    console.error("❌ Technician Summary Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technician summary",
    });
  }
};

exports.getAvailableJobs = async (req, res) => {
  try {
    const technicianId = req.user._id;
    const technician = await User.findById(technicianId);
    if (!technician) return res.status(404).json({ message: "Technician not found" });


    const jobs = await Work.find({
      status: "open",
      specialization: { $in: technician.specialization },
      location: { $regex: new RegExp(technician.location, "i") },
    });

    res.status(200).json({
      message: "Available jobs fetched successfully",
      jobs,
    });
  } catch (err) {
    console.error("Get Available Jobs Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.approveJob = async (req, res) => {
  try {
    const technicianId = req.user._id;
    const { workId } = req.body;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    // Technician sirf apne assigned work ko hi approve kare
    if (work.technicianId.toString() !== technicianId.toString()) {
      return res.status(403).json({ message: "Not authorized for this work" });
    }

    work.status = "approved";
    await work.save();

    res.status(200).json({
      success: true,
      message: "Job approved successfully",
      work,
    });
  } catch (error) {
    console.error("Approve job error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getTechnicianSummarybycount = async (req, res) => {
  try {
    const technicianId = req.user._id; 
    const works = await Work.find({ technicianId }) 
      .populate("clientId", "firstName lastName phone email location")
      .populate("billId")
      .sort({ createdAt: -1 });

    const completed = works.filter(w => w.status === "completed");
    const inProgress = works.filter(w => ["inprogress", "confirm"].includes(w.status));
    const upcoming = works.filter(w => ["approved", "dispatch", "taken", "open"].includes(w.status));
    const onHold = works.filter(w => ["onhold_parts", "rescheduled", "escalated"].includes(w.status));

    const totalEarnings = works.reduce((sum, w) => sum + (w.billId?.totalAmount || 0), 0);

    res.status(200).json({
      success: true,
      summary: {
        total: works.length,
        completed: completed.length,
        inProgress: inProgress.length,
        upcoming: upcoming.length,
        onHold: onHold.length,
        totalEarnings,
      },
      data: {
        completed,
        inProgress,
        upcoming,
        onHold,
      },
    });
  } catch (error) {
    console.error("Technician summary error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllTechnicianWorks = async (req, res) => {
  try {
    const technicianId = req.user._id;

    // 🔍 Fetch all works assigned to this technician
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "firstName lastName phone email location")
      .populate("billId")
      .sort({ createdAt: -1 }); // Latest first

    if (!works.length) {
      return res.status(200).json({
        success: true,
        message: "No works assigned yet",
        works: [],
      });
    }

    // 📊 Optional: categorize works by status (for UI filters)
    const categorized = {
      completed: works.filter(w => w.status === "completed"),
      inProgress: works.filter(w => ["inprogress", "confirm"].includes(w.status)),
      upcoming: works.filter(w => ["approved", "dispatch", "taken", "open"].includes(w.status)),
      onHold: works.filter(w => ["onhold_parts", "rescheduled", "escalated"].includes(w.status)),
    };

    res.status(200).json({
      success: true,
      count: works.length,
      works,
      categorized,
    });
  } catch (error) {
    console.error("❌ Error fetching all technician works:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching technician works",
      error: error.message,
    });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { workId, paymentMethod } = req.body; // "cash" or "upi"
    const technicianId = req.user._id;

    const work = await Work.findById(workId)
      .populate("client", "firstName email")
      .populate("assignedTechnician", "firstName _id");

    if (!work) return res.status(404).json({ message: "Work not found" });

    // ✅ Technician must be assigned to this work
    if (String(work.assignedTechnician?._id) !== String(technicianId)) {
      return res.status(403).json({ message: "Unauthorized: not your assigned work" });
    }

    // ✅ Work must be completed
    if (work.status !== "completed") {
      return res.status(400).json({ message: "Work must be completed before confirming payment" });
    }

    // ✅ Validate payment method
    if (!["cash", "upi"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

    // ✅ Update payment info
    work.payment = {
      method: paymentMethod,
      status: "confirmed",
      confirmedBy: technicianId,
      confirmedAt: new Date(),
      paidAt: work.payment?.paidAt || new Date(), // keep client’s paid time if already set
    };

    // ✅ Optionally update status
    work.status = "confirm";
    await work.save();

    // ✅ (Optional) Send confirmation email to client
    if (work.client?.email) {
      await sendEmail(
        work.client.email,
        "💰 Payment Confirmed - Thank You!",
        `
        <p>Dear ${work.client.firstName || "Customer"},</p>
        <p>Your payment for <b>Work ID: ${work._id}</b> has been successfully confirmed.</p>
        <p><b>Payment Method:</b> ${paymentMethod.toUpperCase()}</p>
        <p>Technician: ${work.assignedTechnician.firstName}</p>
        <p>Thank you for your trust!</p>
        `
      );
    }

    res.status(200).json({
      success: true,
      message: "Payment confirmed successfully by technician.",
      payment: work.payment,
    });
  } catch (err) {
    console.error("❌ Confirm Payment Error:", err);
    res.status(500).json({ message: "Server error while confirming payment." });
  }
};

