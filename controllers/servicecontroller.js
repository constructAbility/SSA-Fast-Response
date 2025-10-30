const mongoose = require('mongoose');
const Service = require('../model/service');
const Work = require('../model/work');
const User= require('../model/user')

exports.WorkComplete = async (req, res) => {
  try {
    const { workId } = req.body;
    const technicianId = req.user._id;

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

    // 🔹 Update work to completed
    work.status = "completed";
    work.completedAt = new Date();
    await work.save();

    // 🔹 Automatically create a Service record with warranty
    let service = await Service.findOne({
      clientId: work.client,
      serviceType: work.serviceType,
    });

    if (!service) {
      service = new Service({
        clientId: work.client,
        technicianId: work.assignedTechnician,
        serviceType: work.serviceType,
        status: "completed",
        completedAt: work.completedAt,
        warrantyDays: 30, // or dynamic based on service type
      });

      await service.save();
    } else {
      // Optional: update existing service
      service.status = "completed";
      service.completedAt = work.completedAt;
      service.warrantyDays = 30;
      await service.save();
    }

    // 🔹 Update booking status to completed
    await Booking.findOneAndUpdate(
      {
        technician: technicianId,
        user: work.client,
        status: { $ne: "completed" }
      },
      { status: "completed" },
      { new: true }
    );

    // 🔹 Update technician status to available again
    await User.findByIdAndUpdate(technicianId, {
      technicianStatus: "available",
      onDuty: false,
      availability: true
    });

    res.status(200).json({
      message: "Work completed successfully and Service with warranty created",
      work,
      service
    });

  } catch (err) {
    console.error("Work Complete Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.raiseWarrantyClaim = async (req, res) => {
  try {
    const { serviceId, issueDescription } = req.body;
    const service = await Service.findById(serviceId);

    if (!service) return res.status(404).json({ message: "Service not found." });

    const now = new Date();
    if (now > service.warrantyExpiresAt) {
      return res.status(400).json({
        message: "Warranty period has expired. Please book a new service.",
      });
    }

    // Create a new re-service
    const newService = new Service({
      clientId: service.clientId,
      technicianId: service.technicianId,
      serviceType: service.serviceType,
      status: "pending",
      price: 0, // free service
      warrantyDays: 0,
      warrantyActive: false,
    });

    await newService.save();

    res.json({
      message: "Warranty claim raised successfully. Technician will be assigned soon.",
      newService,
    });
  } catch (err) {
    console.error("Warranty claim error:", err);
    res.status(500).json({ message: "Server error while raising warranty claim." });
  }
};

exports.checkWarranty = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await Service.findById(serviceId);

    if (!service)
      return res.status(404).json({ message: "Service not found." });

    const now = new Date();
    const inWarranty = service.warrantyExpiresAt && now <= service.warrantyExpiresAt;

    res.json({
      serviceId: service._id,
      inWarranty,
      warrantyExpiresAt: service.warrantyExpiresAt,
      daysLeft: inWarranty
        ? Math.ceil((service.warrantyExpiresAt - now) / (1000 * 60 * 60 * 24))
        : 0,
    });
  } catch (err) {
    console.error("Warranty check error:", err);
    res.status(500).json({ message: "Server error." });
  }
};

exports.completeService = async (req, res) => {
  try {
    const { workId } = req.body; // 🔹 Use workId instead of serviceId
    const work = await Work.findById(workId);

    if (!work) return res.status(404).json({ message: "Work not found." });

    if (work.status !== "completed") {
      return res.status(400).json({ message: "Work is not completed yet." });
    }

    // Check if service already exists
    let service = await Service.findOne({ clientId: work.client, serviceType: work.serviceType });

    if (!service) {
      // 🔹 Create service automatically when work is completed
      service = new Service({
        clientId: work.client,
        technicianId: work.assignedTechnician,
        serviceType: work.serviceType,
        status: "completed",
        completedAt: work.completedAt || new Date(),
        warrantyDays: 30, // or dynamic based on service type
      });

      await service.save();
    } else {
      // Optional: update service if exists
      service.status = "completed";
      service.completedAt = work.completedAt || new Date();
      service.warrantyDays = 30;
      await service.save();
    }

    res.json({
      message: "Service created/updated with warranty after work completion",
      service,
    });

  } catch (err) {
    console.error("Error completing service:", err);
    res.status(500).json({ message: "Server error." });
  }
};
