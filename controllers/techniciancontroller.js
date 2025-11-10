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
      const upiId = "7678661120@ybl"; // Replace with your UPI ID
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
exports.getTechnicianSummary = async (req, res) => {
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

    // Find all open jobs matching technician specialization or location
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

// ✅ Technician approves (takes) a job
// ✅ Technician approves (takes) a job
exports.approveJob = async (req, res) => {
  try {
    const { workId } = req.body;
    const technicianId = req.user._id;

    if (!workId) return res.status(400).json({ message: "Work ID is required" });

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (work.status !== "open")
      return res.status(400).json({ message: "Work already assigned or in progress" });

    // ✅ Assign technician and update status
    work.assignedTechnician = technicianId;
    work.status = "approved";
    await work.save();

    // ✅ Hide similar open works (optional)
    await Work.updateMany(
      { _id: { $ne: workId }, status: "open", serviceType: work.serviceType },
      { $set: { status: "unavailable" } }
    );

    // ✅ Update technician status
    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "approved",
      onDuty: true,
    });

    // ✅ Notify Technician
    await sendNotification(
      technicianId,
      "technician",
      "Work Approved",
      `You have successfully approved the work request (${work.serviceType}).`,
      "success",
      `/technician/work/${work._id}`
    );

    // ✅ Notify Client
    await sendNotification(
      work.client,
      "client",
      "Technician Assigned",
      `Your work request for ${work.serviceType} has been accepted by a technician.`,
      "info",
      `/client/work/${work._id}`
    );

    res.status(200).json({
      message: "Work approved successfully by technician.",
      work,
    });
  } catch (err) {
    console.error("Approve Job Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
