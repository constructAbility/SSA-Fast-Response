const fs = require("fs");
const QRCode = require("qrcode");
const Work = require("../model/work");
const User = require("../model/user");
const Bill = require("../model/Bill");
const { generateBillPDF } = require("../utils/Invoice");
const sendNotification = require("../controllers/nitficationcontrollers");
const sendEmail = require("../utils/sendemail");
const { uploadToCloudinary } = require("../utils/cloudinaryUpload");


exports.completeWorkAndGenerateBill = async (req, res) => {
  try {
    const { workId, serviceCharge = 0, paymentMethod = "upi" } = req.body;
    const technicianId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    const technician = await User.findById(technicianId);
    const client = work.client;

    const totalAmount = Number(serviceCharge);

    // CREATE BILL
    const bill = await Bill.create({
      workId,
      technicianId,
      clientId: client._id,
      serviceCharge,
      totalAmount,
      paymentMethod,
      status: "sent",
    });

    // -------------------- UPI FLOW --------------------
    let upiUri = "";
    let qrBuffer = null;
    const upiId = process.env.UPI_ID;

    if (paymentMethod === "upi") {
      const name = encodeURIComponent(technician.firstName);

      // Normal UPI Link
      upiUri = `upi://pay?pa=${upiId}&pn=${name}&am=${totalAmount}&cu=INR&tn=Service Payment`;

      // CLICKABLE LINK (IMPORTANT)
      var clickableUPI = `https://upi.me/pay?pa=${upiId}&pn=${name}&am=${totalAmount}&cu=INR&tn=Service%20Payment`;

      // QR Code
      const qrBase64 = await QRCode.toDataURL(upiUri);
      qrBuffer = Buffer.from(qrBase64.split(",")[1], "base64");

      bill.upiUri = upiUri;
      bill.clickableUPI = clickableUPI;
      bill.qrImage = qrBase64;
      await bill.save();
    }

    // -------------------- PDF GENERATE --------------------
    const { filePath } = await generateBillPDF(
      work,
      technician,
      client,
      serviceCharge,
      paymentMethod,
      totalAmount,
      qrBuffer,
      upiId
    );

    const pdfBuffer = fs.readFileSync(filePath);

    // email attachments
    const attachments = [
      {
        content: pdfBuffer.toString("base64"),
        filename: "bill.pdf",
        type: "application/pdf",
        disposition: "attachment",
      }
    ];

    if (qrBuffer) {
      attachments.push({
        content: qrBuffer.toString("base64"),
        filename: "upi-qr.png",
        type: "image/png",
        disposition: "inline",
        content_id: "qr_code",
      });
    }

    // -------------------- EMAIL BODY --------------------
    const emailBody = `
      <p>Hello ${client.firstName},</p>
      <p>Your service <b>${work.serviceType}</b> has been completed.</p>
      <p><b>Total Amount:</b> ₹${totalAmount}</p>

      ${
        paymentMethod === "upi"
          ? `
            <p><b>Pay Now:</b> 
              <a href="${clickableUPI}">
                Click Here to Pay Using UPI
              </a>
            </p>
            <p>Or Scan QR Code:</p>
            <img src="cid:qr_code" width="200" />
          `
          : "<p><b>Payment Mode:</b> Cash</p>"
      }

      <p>Your bill PDF is attached below.</p>
      <p>Thank you!</p>
    `;

    await sendEmail(
      client.email,
      "Your Bill & Payment Details",
      emailBody,
      attachments
    );

    // UPDATE WORK
    work.status = "completed";
    work.completedAt = new Date();
    work.billId = bill._id;
    await work.save();

    res.status(200).json({
      message: "Work completed & bill emailed to user.",
      bill,
      upiUri,
      clickableUPI,
    });

  } catch (err) {
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
        <p>Your payment for <b>Work ID: ${work.token}</b> has been successfully confirmed.</p>
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


exports.updateLocationAndRoutes = async (req, res) => {
  try {
    const { lat, lng, selectedRouteIndex } = req.body;
    const technicianId = req.user._id;

    if (!lat || !lng)
      return res.status(400).json({ message: "Latitude and longitude required" });

    const work = await Work.findOne({
      assignedTechnician: technicianId,
      status: { $in: ["approved", "taken", "dispatch", "inprogress"] },
    }).populate("client", "coordinates name");

    if (!work) {
      return res.status(403).json({
        message: "You cannot update location until work is approved.",
      });
    }

    await User.findByIdAndUpdate(technicianId, {
      coordinates: { lat, lng },
      lastLocationUpdate: new Date(),
      onDuty: true
    });


    if (work.status === "approved") {
      work.status = "dispatch";
      await work.save();
    }

 
    const clientLat = work.coordinates?.lat || work.client.coordinates.lat;
    const clientLng = work.coordinates?.lng || work.client.coordinates.lng;

    
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${lat},${lng}&destination=${clientLat},${clientLng}&mode=driving&alternatives=true&key=${googleKey}`;

    const response = await axios.get(url);
    const data = response.data;

    if (data.status !== "OK") {
      return res.status(400).json({ message: "Google Directions API Error" });
    }

    // If technician selected route
    if (selectedRouteIndex !== undefined) {
      work.selectedRouteIndex = selectedRouteIndex;
      await work.save();
    }

    const finalRouteIndex = work.selectedRouteIndex ?? 0;
    const finalRoute = data.routes[finalRouteIndex];
    const leg = finalRoute.legs[0];

    res.status(200).json({
      message: "Location updated",
      selectedRouteIndex: finalRouteIndex,
      eta: leg.duration.text,
      distance: leg.distance.text,
      polyline: finalRoute.overview_polyline.points,
      allRoutes: data.routes.map((r, i) => ({
        index: i,
        summary: r.summary,
        distance: r.legs[0].distance.text,
        duration: r.legs[0].duration.text,
        polyline: r.overview_polyline.points,
      }))
    });

  } catch (err) {
    console.error("UpdateLocation+Routes Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

