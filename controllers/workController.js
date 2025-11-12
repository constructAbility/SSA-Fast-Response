const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const AdminNotification=require('../model/adminnotification')
const axios = require("axios");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const nodemailer = require("nodemailer");
const sendemail=require('../utils/sendemail')
const { uploadToCloudinary } = require("../utils/cloudinaryUpload");
const generateToken = (id) => {
  return `REQ-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
};

exports.createWork = async (req, res) => {
  try {
    const { 
      serviceType, 
      specialization, 
      description, 
      location, 
      serviceCharge,
      technicianId, 
      lat, 
      lng 
    } = req.body;

    const clientId = req.user._id;

    if (!serviceType || !specialization || !location)
      return res.status(400).json({ message: "Missing required fields" });

    if (!lat || !lng)
      return res.status(400).json({ message: "Client coordinates (lat, lng) required" });

    // Normalize specialization
    let specs = [];
    if (typeof specialization === "string") {
      specs = specialization.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(specialization)) {
      specs = specialization.map(s => s.trim().toLowerCase());
    }

    const normalizedLocation = location.trim().toLowerCase();

    //  Save client's coordinates in user document
    await User.findByIdAndUpdate(clientId, {
      coordinates: { lat, lng },
      lastLocationUpdate: new Date()
    });

    //  Create work with client coordinates
    const work = await Work.create({
      client: clientId,
      serviceType,
      specialization: specs,
      description,
      serviceCharge,
      location: normalizedLocation,
      coordinates: { lat, lng },
      assignedTechnician: technicianId || null,
      status: technicianId ? "taken" : "open",
      token: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    });

    //  Find matching technicians
    const technicians = await User.find({
      role: "technician",
      specialization: { $in: specs.map(s => new RegExp(s, "i")) },
      location: { $regex: new RegExp(normalizedLocation, "i") }
    }).select("name phone email experience specialization location ratings coordinates");

    //  Attach availability
    const techniciansWithStatus = [];
    for (const tech of technicians) {
      const inWork = await Work.findOne({
        assignedTechnician: tech._id,
        status: { $in: ["taken", "approved"] }
      });

      techniciansWithStatus.push({
        ...tech.toObject(),
        employeeStatus: inWork ? "in work" : "available"
      });
    }

    res.status(201).json({
      message: technicianId
        ? "Work created and assigned to technician"
        : "Work request submitted successfully",
      work,
      matchingTechnicians: techniciansWithStatus.length
        ? techniciansWithStatus
        : "No matching technicians found"
    });
    await sendNotification(
  work.client,
  "client",
  "Work Request Submitted",
  `Your work request (${work.serviceType}) has been successfully submitted.`,
  "success",
  `/client/work/${work._id}`
);


  } catch (err) {
    console.error("Work Creation Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.findMatchingTechnicians = async (req, res) => {
  try {
    const clientId = req.user._id;
    let { specialization, location, date, description, serviceType, time } = req.body;

    if (!specialization || !location || !date) {
      return res.status(400).json({ message: "Specialization, location, and date required" });
    }

    if (typeof specialization === "string") {
      specialization = [specialization];
    }

    const workDate = new Date(date);
    if (isNaN(workDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    let specs = [];
    if (typeof specialization === "string") {
      specs = specialization
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (Array.isArray(specialization)) {
      specs = specialization.map(s => s.trim().toLowerCase());
    }

    const normalizedLocation = location.trim().toLowerCase();

  
    const work = await Work.create({
      client: clientId,
      serviceType,
      specialization: specs,
      description,
      location: normalizedLocation,
      date: workDate,
      time,
      status: "open",
      token: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    });
      
    const technicians = await User.find({
      role: "technician",
      specialization: { $in: specs.map(s => new RegExp(s, "i")) },
      location: { $regex: new RegExp(normalizedLocation, "i") }
    }).select("name phone email experience specialization location ratings");

    const techniciansWithStatus = [];
    for (const tech of technicians) {
      const inWork = await Work.findOne({
        assignedTechnician: tech._id,
        status: { $in: ["taken", "approved"] }
      });

      techniciansWithStatus.push({
        ...tech.toObject(),
        employeeStatus: inWork ? "in work" : "available"
      });

     
      await sendNotification(
        tech._id,
        "technician",
        "New Work Request",
        `New job available: ${serviceType} in ${location}`,
        "info",
        `/technician/jobs`
      );
    }

   
    await sendNotification(
      clientId,
      "client",
      "Work Request Submitted",
      `Your request for ${serviceType} has been submitted successfully.`,
      "success",
      `/client/work/${work._id}`
    );

    res.status(201).json({
      message: "Work request submitted and sent to all matching technicians",
      work,
      matchingTechnicians: techniciansWithStatus.length
        ? techniciansWithStatus
        : "No matching technicians found"
    });

  } catch (err) {
    console.error("Technician Search Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.bookTechnician = async (req, res) => {
  try {
    const { workId, technicianId, serviceType, serviceCharge, description, date, time } = req.body;
    const userId = req.user._id;

    if (!technicianId || !workId)
      return res.status(400).json({ message: "Work ID and Technician ID are required" });

 
    let workDate;
    if (date && time) {
      
      let formattedTime = time;
      if (time.includes("PM") || time.includes("AM")) {
        const parsedTime = new Date(`1970-01-01T${time}`);
        if (!isNaN(parsedTime.getTime())) {
          formattedTime = parsedTime.toLocaleTimeString("en-GB", { hour12: false });
        }
      }
      workDate = new Date(`${date}T${formattedTime}`);
    } else if (date) {
      workDate = new Date(date);
    } else {
      workDate = new Date();
    }

    if (isNaN(workDate.getTime()))
      return res.status(400).json({ message: "Invalid date or time format" });

    const client = await User.findById(userId);
    if (!client) return res.status(404).json({ message: "Client not found" });

    const technician = await User.findById(technicianId);
    if (!technician) return res.status(404).json({ message: "Technician not found" });

    // 🧩 New Check — Same client, same technician, same serviceType & serviceCharge
    const duplicateBooking = await Booking.findOne({
      user: userId,
      technician: technicianId,
      serviceType: serviceType,
      serviceCharge: serviceCharge,
      status: { $in: ["open", "taken", "dispatch", "inprogress"] }, // still active
    });

    if (duplicateBooking) {
      return res.status(400).json({
        message: `You already booked technician ${technician.name} for ${serviceType} at ₹${serviceCharge}. Please wait for completion or choose another technician.`,
      });
    }

    // ⚠️ Check if technician already in other work
    const conflict = await Work.findOne({
      assignedTechnician: technicianId,
      status: { $in: ["taken", "dispatch", "inprogress"] }
    });
    if (conflict)
      return res.status(400).json({ message: "Technician already assigned to another work" });

    // 🧾 Create new booking
    const booking = await Booking.create({
      user: userId,
      technician: technicianId,
      serviceType,
      serviceCharge,
      description,
      location: client.location || "Not available",
      address: client.address || "Not available",
      date: workDate,
      status: "open",
    });

    // 🔄 Update work
    const updatedWork = await Work.findByIdAndUpdate(
      workId,
      { assignedTechnician: technicianId, status: "taken" },
      { new: true }
    );
    if (!updatedWork) return res.status(404).json({ message: "Work not found for assignment" });

    // 👷 Update technician
    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "dispatched",
      onDuty: true,
      $inc: { totalJobs: 1 },
    });

    // 🗺️ ETA Calculation
    let etaMessage = "ETA not available";
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const techC = technician.coordinates;
    const workC = updatedWork.coordinates;

    if (techC?.lat && techC?.lng && workC?.lat && workC?.lng) {
      const origin = `${techC.lat},${techC.lng}`;
      const destination = `${workC.lat},${workC.lng}`;
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&departure_time=now&traffic_model=best_guess&key=${googleKey}`;

      try {
        const resp = await axios.get(url);
        const eta = resp.data?.rows?.[0]?.elements?.[0];
        if (eta?.status === "OK") {
          const minutes = Math.round(eta.duration_in_traffic?.value / 60);
          etaMessage = `Technician ${technician.name} will arrive in approximately ${minutes} minutes (live traffic ETA).`;
        }
      } catch (err) {
        console.log("ETA calculation failed:", err.message);
      }
    }

    // ✅ Success
    res.status(201).json({
      message: "Technician booked successfully.",
      booking,
      work: updatedWork,
      technicianStatus: "dispatched",
      eta: etaMessage,
    });

  } catch (err) {
    console.error("Book Technician Error:", err);
    res.status(500).json({ message: "Server error while booking technician" });
  }
};



exports.WorkStart = async (req, res) => {
  try {
    const { workId } = req.body;
    const technicianId = req.user._id;
    const beforePhoto = req.file; // 📸 Multer will store file here

    if (!workId) {
      return res.status(400).json({ message: "Work ID is required" });
    }

    const work = await Work.findById(workId);
    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    // ✅ Upload before photo (Cloudinary or local)
    let beforePhotoUrl = "";
    if (beforePhoto) {
      // 📤 Cloudinary upload
      const uploadRes = await uploadToCloudinary(beforePhoto.path, "work_before_photos");
      beforePhotoUrl = uploadRes.secure_url;

      // OR if local:
      // beforePhotoUrl = `/uploads/${beforePhoto.filename}`;
    }

    // ✅ Update work status and save photo
    work.status = "inprogress";
    work.startedAt = new Date();
    work.beforephoto = beforePhotoUrl; // ✅ Save to DB
    await work.save();

    // ✅ Update technician’s personal status
    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "inprogress",
      onDuty: true,
      availability: false,
    });
await sendNotification(
  technicianId,
  "technician",
  "Job Status Updated",
  `You have started work (${work.serviceType}).`,
  "info",
  `/technician/work/${work._id}`
);

await sendNotification(
  work.client,
  "client",
  "Work In Progress",
  `Your job (${work.serviceType}) has been marked as in-progress.`,
  "info",
  `/client/work/${work._id}`
);

    // ✅ Update related booking if any
    await Booking.findOneAndUpdate(
      { technician: technicianId, user: work.client, status: { $in: ["open", "taken", "dispatch"] } },
      { status: "inprogress" }
    );

    res.status(200).json({
      message: "Technician started the work. Status set to in-progress.",
      work,
      beforePhoto: beforePhotoUrl,
    });
  } catch (err) {
    console.error("❌ Work Start Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.WorkComplete = async (req, res) => {
  try {
    const { workId, usedMaterials, serviceCharge, total, notes } = req.body;
    const technicianId = req.user._id;
    const afterphoto = req.file;

    if (!workId) return res.status(400).json({ message: "Work ID is required" });

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

 
    let afterPhotoUrl = "";
    if (afterphoto) {
      const uploadRes = await uploadToCloudinary(afterphoto.path, "work_after_photos");
      afterPhotoUrl = uploadRes.secure_url;
    }

    let subtotal = serviceCharge || 0;
    if (Array.isArray(usedMaterials)) {
      usedMaterials.forEach((item) => {
        subtotal += item.quantity * item.price;
      });
    }

    
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!fs.existsSync("./invoices")) fs.mkdirSync("./invoices");
    const filePath = `./invoices/${invoiceNumber}.pdf`;

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text("One Step Solution", { align: "center" });
      doc.moveDown();
      doc.fontSize(14).text("Service Completion Invoice", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
      doc.text(`Date: ${new Date().toLocaleDateString()}`);
      doc.text(`Client: ${work.client.firstName} ${work.client.lastName}`);
      doc.text(`Email: ${work.client.email}`);
      doc.text(`Work ID: ${work._id}`);
      doc.moveDown();

      doc.font("Helvetica-Bold").text("Used Materials:");
      doc.font("Helvetica");
      if (usedMaterials?.length) {
        usedMaterials.forEach((item) => {
          doc.text(`${item.name} - Qty: ${item.quantity} × ₹${item.price} = ₹${item.quantity * item.price}`);
        });
      } else {
        doc.text("No materials used.");
      }

      doc.moveDown();
      doc.text(`Service Charge: ₹${serviceCharge || 0}`);
      doc.text(`Subtotal: ₹${subtotal}`);
      doc.text(`Total: ₹${total || subtotal}`);
      doc.moveDown();
      doc.text(`Notes: ${notes || "N/A"}`);

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
    });


    work.status = "completed";
    work.completedAt = new Date();
    work.invoice = { invoiceNumber, usedMaterials, serviceCharge, subtotal, total, pdfUrl: filePath };
    work.afterphoto = afterPhotoUrl; 
    await work.save();

   
    const paymentLink = `https://payment.one-step-solution.in/pay?workId=${work._id}`;
    const pdfBuffer = fs.readFileSync(filePath);
      const attachments = [
        {
          content: pdfBuffer.toString("base64"),
          filename: `${invoiceNumber}.pdf`,
          type: "application/pdf",
          disposition: "attachment",
        },
      ];
   
    await sendemail(
      work.client.email,
      `Service Completed - ${invoiceNumber}`,
      `
      <p>Hello ${work.client.firstName},</p>
      <p>Your service has been successfully completed by our technician.</p>
      <p><b>Total Bill: ₹${total || subtotal}</b></p>
      <p>You can make the payment securely using the link below:</p>
      <p><a href="${paymentLink}" target="_blank" style="color:#007bff;">Click here to Pay Now</a></p>
      <p>Thank you for choosing One Step Solution!</p>
      <p>Regards,<br>Team One Step Solution</p>
      `,
      
      attachments
    );

    
    res.status(200).json({
      success: true,
      message: "Work completed, photo uploaded, and invoice sent with payment link.",
      workId: work._id,
      afterPhoto: afterPhotoUrl,
      invoice: work.invoice,
      paymentLink,
    });
    await sendNotification(
  technicianId,
  "technician",
  "Job Completed",
  `You successfully completed ${work.serviceType}.`,
  "success",
  `/technician/work/${work._id}`
);

await sendNotification(
  work.client,
  "client",
  "Job Completed",
  `Your job (${work.serviceType}) is completed. Invoice sent via email.`,
  "success",
  `/client/work/${work._id}`
);


  } catch (err) {
    console.error("❌ Work Complete Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const technicianId = req.user._id;

    if (!lat || !lng)
      return res.status(400).json({ message: "Latitude and longitude required" });

    // 🔍 Find active approved work
    const work = await Work.findOne({
      assignedTechnician: technicianId,
      status: { $in: ["approved", "taken", "dispatch", "inprogress"] },
    }).populate("client", "name phone email coordinates serviceType");

    // 🚫 Block updates if no approved work
    if (!work || work.status !== "approved") {
      return res.status(403).json({
        message: "You cannot update location until the work is approved.",
      });
    }

    // ✅ Proceed with location update
    const technician = await User.findByIdAndUpdate(
      technicianId,
      {
        coordinates: { lat, lng },
        lastLocationUpdate: new Date(),
        onDuty: true,
      },
      { new: true }
    );

    // 🔹 Auto move to dispatch
    work.status = "dispatch";
    await work.save();

    await sendNotification(
      work.client._id,
      "client",
      "Technician on the Way",
      `${technician.name} is on the way for your ${work.serviceType} service.`,
      "info",
      `/client/work/${work._id}`
    );

    res.status(200).json({
      message: "Technician location updated and status set to 'dispatch'.",
      workStatus: "dispatch",
    });
  } catch (err) {
    console.error("Update Location Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};



exports.trackTechnician = async (req, res) => {
  try {
    const { workId } = req.params;
    const work = await Work.findById(workId).populate("assignedTechnician");

    if (!work || !work.assignedTechnician) {
      return res.status(404).json({ message: "Technician not assigned yet" });
    }

    const technician = work.assignedTechnician;
    const client = await User.findById(work.client);

    // Prefer work coordinates, else fallback to client's saved coordinates
    const clientLat = work.coordinates?.lat || client.coordinates?.lat;
    const clientLng = work.coordinates?.lng || client.coordinates?.lng;

    if (
      !technician.coordinates?.lat ||
      !technician.coordinates?.lng ||
      !clientLat ||
      !clientLng
    ) {
      return res.status(400).json({
        message: "Missing coordinates for route calculation",
      });
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    const origin = `${technician.coordinates.lat},${technician.coordinates.lng}`;
    const destination = `${clientLat},${clientLng}`;

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&departure_time=now&key=${googleKey}`;

    const response = await axios.get(url);
    const data = response.data;

    // Log response if needed (debug)
    // console.log("Google API response:", JSON.stringify(data, null, 2));

    // Check top-level and element statuses
    const element = data.rows?.[0]?.elements?.[0];
    if (data.status !== "OK" || !element || element.status !== "OK") {
      console.error("Google API Error:", data.status, element?.status);
      return res.status(400).json({
        message: `Google Maps API error: ${data.status} / ${element?.status}`,
      });
    }

    // Prefer duration_in_traffic; fallback to duration
    const etaSeconds =
      element.duration_in_traffic?.value || element.duration?.value || null;

    const distanceText = element.distance?.text || "Unknown";
    const minutes = etaSeconds ? Math.round(etaSeconds / 60) : "N/A";

    res.status(200).json({
      technician: {
        name: technician.name,
        coordinates: technician.coordinates,
        lastUpdate: technician.lastLocationUpdate,
        liveStatus: work.status,
      },
      client: {
        name: client.name,
        coordinates: { lat: clientLat, lng: clientLng },
      },
      eta: `${minutes} minutes`,
      distance: distanceText,
    });
  } catch (err) {
    console.error("Track Technician Error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getClientWorkStatus = async (req, res) => {
  try {
    const { workId } = req.params;
    const clientId = req.user._id;

    const work = await Work.findById(workId)
      .populate("assignedTechnician", "name phone email technicianStatus coordinates lastLocationUpdate")
      .populate("client", "name phone email coordinates");

    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    if (String(work.client._id) !== String(clientId)) {
      return res.status(403).json({ message: "Not authorized to view this work" });
    }

    // Prepare technician data
    const technician = work.assignedTechnician;
    let eta = "ETA not available";

    // 🔹 Calculate ETA if both coordinates exist
    if (technician?.coordinates?.lat && technician?.coordinates?.lng && work.coordinates?.lat && work.coordinates?.lng) {
      try {
        const orsKey = process.env.ORS_KEY;
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${technician.coordinates.lng},${technician.coordinates.lat}&end=${work.coordinates.lng},${work.coordinates.lat}`;
        const response = await axios.get(url);
        const seconds = response.data.features[0].properties.summary.duration;
        const minutes = Math.round(seconds / 60);
        eta = `${minutes} minutes`;
      } catch (err) {
        console.log("ETA calc failed:", err.message);
      }
    }

    // 🔹 Prepare response object
    const workStatus = {
      workId: work._id,
      token: work.token,
      serviceType: work.serviceType,
      specialization: work.specialization,
      serviceCharge:work.serviceCharge,
      description: work.description,
      location: work.location,
      status: work.status,
      createdAt: work.createdAt,
      startedAt: work.startedAt,
      completedAt: work.completedAt,
      client: {
        name: work.client.name,
        phone: work.client.phone,
        email: work.client.email,
      },
      technician: technician
        ? {
            name: technician.name,
            phone: technician.phone,
            email: technician.email,
            status: technician.technicianStatus,
            coordinates: technician.coordinates,
            lastUpdate: technician.lastLocationUpdate,
          }
        : null,
      eta,
    };

    res.status(200).json({
      message: "Work status fetched successfully",
      workStatus,
    });
  } catch (err) {
    console.error("Client Work Status Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.reportWorkIssue = async (req, res) => {
  try {
    const { workId, issueType, remarks } = req.body;
    const technicianId = req.user._id;

    if (!workId || !issueType) {
      return res.status(400).json({ message: "Work ID and issue type required" });
    }

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.assignedTechnician) !== String(technicianId)) {
      return res.status(403).json({ message: "You are not assigned to this work" });
    }

    // ⚙️ Your existing switch logic (unchanged)
    switch (issueType) {
      case "need_parts":
        work.status = "onhold_parts";
        work.remarks = remarks || "Parts required for repair";
        await work.save();

        console.log(`Parts required for Work ID: ${workId}`);
        break;

      case "need_specialist":
        work.status = "escalated";
        work.remarks = remarks || "Requires senior technician";
        await work.save();

        console.log(`Escalated to supervisor for Work ID: ${workId}`);
        break;

      case "customer_unavailable":
        work.status = "rescheduled";
        work.remarks = remarks || "Customer not available at site";
        await work.save();

        console.log(`Work rescheduled due to customer unavailability`);
        break;

      default:
        return res.status(400).json({ message: "Invalid issue type" });
    }

    // ✅ 🔹 ADD ADMIN NOTIFICATION (only new part)
    try {
      await AdminNotification.create({
        type: "work_issue",
        message: `Technician ${req.user.name || technicianId} reported an issue (${issueType}) for work ${work._id}`,
        work: work._id,
        technician: technicianId,
        issueType,
        remarks: remarks || ""
      });
      console.log(`✅ Admin notified about issue ${issueType} for Work ${workId}`);
    } catch (notifErr) {
      console.error("❌ Admin notification creation failed:", notifErr.message);
    }

    // 🔹 Existing booking & technician update (unchanged)
    await Booking.findOneAndUpdate(
      { technician: technicianId, user: work.client._id },
      { status: work.status }
    );

    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "pending",
      availability: true
    });

    // 🔹 Final response (unchanged)
    return res.status(200).json({
      message: "Work issue reported successfully.",
      workStatus: work.status,
      remarks: work.remarks
    });

  } catch (err) {
    console.error("Report Work Issue Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
 
exports.getAdminNotifications = async (req, res) => {
  
  try {
    const notifications = await AdminNotification.find()
      .sort({ createdAt: -1 })
      .populate("work", "serviceType status location")
      .populate("technician", "name email phone");

    if (!notifications.length) {
      return res.status(200).json({ message: "No notifications found", notifications: [] });
    }

    res.status(200).json({
      message: "Admin notifications fetched successfully",
      count: notifications.length,
      notifications
    });
  } catch (err) {
    console.error("Get Admin Notifications Error:", err.message);
    res.status(500).json({ message: "Server error while fetching notifications" });
  }
};



exports.payBill = async (req, res) => {
  try {
    const { workId, paymentMethod, paymentStatus } = req.body; // paymentMethod = "cash" | "upi"
    const clientId = req.user._id;

    const work = await Work.findById(workId).populate("client");
    if (!work) return res.status(404).json({ message: "Work not found" });

    if (String(work.client._id) !== String(clientId))
      return res.status(403).json({ message: "Unauthorized" });

    if (work.status !== "completed")
      return res.status(400).json({ message: "Work not completed yet" });

    // ✅ Update payment info
    work.payment = {
      method: paymentMethod,
      status: paymentStatus || "paid",
      paidAt: new Date(),
    };
    await work.save();
await sendNotification(
  work.client,
  "client",
  "Payment Successful",
  `Payment received for work ID: ${work._id}`,
  "success",
  `/client/work/${work._id}`
);

    
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
