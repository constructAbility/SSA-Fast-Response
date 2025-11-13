const express = require("express");
const router = express.Router();
const { protect , authorize } = require("../middelware/authMiddelware");
const technicianController = require("../controllers/techniciancontroller");

// Technician Summary
router.get("/summary", protect,authorize('technician') ,technicianController.getAllTechnicianWorks );// abhi k liye ye wali work details 
router.get("/summary-count", protect,authorize('technician') ,technicianController.getTechnicianSummarybycount );


router.get("/summary-count-1", protect,authorize('technician') ,technicianController.getTechnicianSummary1 );// abhi k liye yw wali count
// Available Jobs
router.get("/available-jobs", protect, technicianController.getAvailableJobs);

// Approve Job
router.post("/approve-job", protect, technicianController.approveJob);



router.post("/payment", protect,authorize('technician') ,technicianController.confirmPayment);
module.exports = router;
