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
    const { workId, serviceCharge = 0, paymentMethod = "cash", upiId } = req.body;
    const technicianId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    const technician = await User.findById(technicianId);
    const client = work.client;

    // 📸 After Photo Required
    if (!req.file) {
      return res.status(400).json({ message: "After photo is required" });
    }

    const uploadedImage = await uploadToCloudinary(req.file.path, "after_photos");
    work.afterPhoto = uploadedImage.secure_url;

    // 💰 Total Amount
    const totalAmount = Number(serviceCharge);

    // ⚡ Generate UPI QR if needed
    let qrBuffer = null;
    let upiUri = null;

    if (paymentMethod === "upi") {
      upiUri = `upi://pay?pa=${upiId}&pn=${technician.firstName}&am=${totalAmount}&cu=INR`;

      qrBuffer = await QRCode.toBuffer(upiUri);
    }

    // 🧾 Create BILL in DB
    const bill = await Bill.create({
      workId: work._id,
      technician: technicianId,
      client: client._id,
      serviceCharge,
      totalAmount,
      paymentMethod,
      status: "pending",
    });

    // 📄 Generate PDF Invoice
    await generateBillPDF(
      work,
      technician,
      client,
      serviceCharge,
      paymentMethod,
      totalAmount,
      qrBuffer,
      upiId
    );

    // 🔄 Update Work
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;

    await work.save();

    res.status(200).json({
      message: "Work completed, bill created, after photo saved.",
      afterPhoto: work.afterPhoto,
      bill,
      upiUri,
    });

  } catch (err) {
    console.error("COMPLETE WORK ERROR:", err);
    res.status(500).json({ message: "Error", error: err.message });
  }
};

exports.getTechnicianSummary1 = async (req, res) => {
  try {
   
    const technicianId = req.user._id;

  
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

    const completedWorks = await Work.find({
      assignedTechnician: technicianId,
      status: "completed",
    });

    const totalEarnings = completedWorks.reduce((sum, work) => {
      const invoiceTotal = work.invoice?.total || 0;
      const serviceCharge = work.serviceCharge || 0;
      return sum + invoiceTotal + serviceCharge;
    }, 0);


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
      .populate("client", "fisrtName lastName date phone email location")
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

    if (!work.assignedTechnician) {
      return res.status(400).json({ message: "No technician assigned to this work" });
    }

    if (work.assignedTechnician.toString() !== technicianId.toString()) {
      return res.status(403).json({ message: "You are not authorized to approve this job" });
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

  
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "firstName lastName phone email location")
      .populate("billId")
      .sort({ createdAt: -1 }); 

    if (!works.length) {
      return res.status(200).json({
        success: true,
        message: "No works assigned yet",
        works: [],
      });
    }

   
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
    const { workId, paymentMethod } = req.body; 
    const technicianId = req.user._id;

    const work = await Work.findById(workId)
      .populate("client", "firstName email")
      .populate("assignedTechnician", "firstName _id");

    if (!work) return res.status(404).json({ message: "Work not found" });


    if (String(work.assignedTechnician?._id) !== String(technicianId)) {
      return res.status(403).json({ message: "Unauthorized: not your assigned work" });
    }

   
    if (work.status !== "completed") {
      return res.status(400).json({ message: "Work must be completed before confirming payment" });
    }

    
    if (!["cash", "upi"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method" });
    }

   
    work.payment = {
      method: paymentMethod,
      status: "confirmed",
      confirmedBy: technicianId,
      confirmedAt: new Date(),
      paidAt: work.payment?.paidAt || new Date(), 
    };

   
    work.status = "confirm";
    await work.save();

    
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

