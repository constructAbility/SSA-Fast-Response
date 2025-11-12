const express = require("express");
const router = express.Router();
// const { protectTechnician } = require("../middelware/authMiddelware");
const {
  getAllTechnicianWorks,
  getTechnicianWorkStatus,
} = require("../controllers/statuscontrollers");

// Technician routes
router.get("/works",  getAllTechnicianWorks);
router.get("/work-status/:workId",  getTechnicianWorkStatus);

module.exports = router;
