const express = require('express');
const { protect, authorize } = require('../middelware/authMiddelware');
const upload = require("../utils/upload");

const router = express.Router();

const { 
  createWork, 
  findMatchingTechnicians, 
  bookTechnician, 
  WorkStart,
  WorkComplete,
  trackTechnician,
  updateLocation,getClientWorkStatus,reportWorkIssue,getAdminNotifications
} = require('../controllers/workController');
const { 
 completeWorkAndGenerateBill ,getTechnicianSummary
} = require('../controllers/techniciancontroller');

const { getAllWorks } = require('../controllers/statuscontrollers');


router.post('/work/create', protect, createWork);


router.post('/work/find-technicians', protect, findMatchingTechnicians);

router.post('/work/book-technician', protect, bookTechnician);


router.post('/work/start', protect,upload.single("beforePhoto"), authorize('technician'), WorkStart);
router.post('/work/complete-1', protect, upload.single("afterphoto"),authorize('technician'),  WorkComplete  );

router.post('/work/complete', protect, authorize('technician'), completeWorkAndGenerateBill  );
router.post('/work/issue', protect, authorize('technician'), reportWorkIssue);


router.get('/getAllWork', protect, getAllWorks);

// router.get('/issuetoadmin',getAdminNotifications);

router.patch('/work/update-location',protect,updateLocation);

router.get('/track-technician/:workId',protect,trackTechnician)

router.get('/client-work/:workId',protect, authorize('client'),getClientWorkStatus)

router.get('/technician-summry',protect,getTechnicianSummary)

module.exports = router;
