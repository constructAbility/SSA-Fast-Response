const express = require("express");
const router = express.Router();
const auth = require("../middelware/authMiddelware");
const technicianController = require("../controllers/techniciancontroller");

router.get("/available-jobs", auth, technicianController.getAvailableJobs);
router.post("/approve-job", auth, technicianController.approveJob);

module.exports = router;
