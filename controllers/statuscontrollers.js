
const mongoose= require('mongoose')
const Work = require("../model/work");



const axios = require("axios");

exports.getAllWorks = async (req, res) => {
  try {
    const clientId = req.user._id;

    // 🔹 Sirf us client ke works fetch karo
    const works = await Work.find({ client: clientId })
      .populate("client", "name email phone")
      .populate("assignedTechnician", "name email phone specialization ratings")
      .sort({ createdAt: -1 });

    if (!works.length) {
      return res.status(200).json({ message: "No work requests found for this client" });
    }

    const formattedWorks = works.map((work) => ({
      id: work._id,
      serviceType: work.serviceType,
      specialization: work.specialization,
      description: work.description,
      location: work.location,
      date: work.date,
      status: work.status,
      token: work.token,
      createdAt: work.createdAt,
      client: {
        name: work.client?.name,
        email: work.client?.email,
        phone: work.client?.phone,
      },
      assignedTechnician: work.assignedTechnician
        ? {
            name: work.assignedTechnician.name,
            email: work.assignedTechnician.email,
            phone: work.assignedTechnician.phone,
            specialization: work.assignedTechnician.specialization,
            ratings: work.assignedTechnician.ratings,
          }
        : null,
    }));

    res.status(200).json({
      message: "All work requests retrieved for this client",
      totalWorks: works.length,
      works: formattedWorks,
    });
  } catch (err) {
    console.error("Get All Works Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// GET /api/client/work-status/:workId
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


// 🔹 Get all works assigned to the logged-in technician
exports.getAllTechnicianWorks = async (req, res) => {
  try {
    const technicianId = req.user._id; 

    
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "name email phone location")
      .populate("assignedTechnician", "name email phone specialization ratings")
      .sort({ createdAt: -1 });

    if (!works.length) {
      return res
        .status(200)
        .json({ message: "No work requests assigned to this technician" });
    }

    const formattedWorks = works.map((work) => ({
      id: work._id,
      serviceType: work.serviceType,
      specialization: work.specialization,
      description: work.description,
      location: work.location,
      date: work.date,
      status: work.status,
      token: work.token,
      createdAt: work.createdAt,
      client: {
        name: work.client?.name,
        email: work.client?.email,
        phone: work.client?.phone,
      },
      technician: {
        name: work.assignedTechnician?.name,
        email: work.assignedTechnician?.email,
        phone: work.assignedTechnician?.phone,
        specialization: work.assignedTechnician?.specialization,
        ratings: work.assignedTechnician?.ratings,
      },
    }));

    res.status(200).json({
      message: "All works assigned to this technician retrieved",
      totalWorks: works.length,
      works: formattedWorks,
    });
  } catch (err) {
    console.error("Get Technician Works Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getTechnicianWorkStatus = async (req, res) => {
  try {
    const { workId } = req.params;
    const technicianId = req.user._id;

    const work = await Work.findById(workId)
      .populate("assignedTechnician", "name phone email technicianStatus coordinates lastLocationUpdate")
      .populate("client", "name phone email coordinates");

    if (!work) {
      return res.status(404).json({ message: "Work not found" });
    }

    // ✅ Technician authorization check
    if (String(work.assignedTechnician?._id) !== String(technicianId)) {
      return res
        .status(403)
        .json({ message: "Not authorized to view this work" });
    }

    // Prepare ETA calculation (if client location exists)
    let eta = "ETA not available";

    if (
      work.assignedTechnician?.coordinates?.lat &&
      work.assignedTechnician?.coordinates?.lng &&
      work.client?.coordinates?.lat &&
      work.client?.coordinates?.lng
    ) {
      try {
        const orsKey = process.env.ORS_KEY;
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${orsKey}&start=${work.assignedTechnician.coordinates.lng},${work.assignedTechnician.coordinates.lat}&end=${work.client.coordinates.lng},${work.client.coordinates.lat}`;
        const response = await axios.get(url);
        const seconds = response.data.features[0].properties.summary.duration;
        const minutes = Math.round(seconds / 60);
        eta = `${minutes} minutes`;
      } catch (err) {
        console.log("ETA calc failed:", err.message);
      }
    }

    // 🔹 Response structure
    const workStatus = {
      workId: work._id,
      token: work.token,
      serviceType: work.serviceType,
      specialization: work.specialization,
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
      technician: {
        name: work.assignedTechnician.name,
        phone: work.assignedTechnician.phone,
        email: work.assignedTechnician.email,
        status: work.assignedTechnician.technicianStatus,
        coordinates: work.assignedTechnician.coordinates,
        lastUpdate: work.assignedTechnician.lastLocationUpdate,
      },
      eta,
    };

    res.status(200).json({
      message: "Technician work status fetched successfully",
      workStatus,
    });
  } catch (err) {
    console.error("Technician Work Status Error:", err);
    res.status(500).json({ message: "Server error" });
  }

};
