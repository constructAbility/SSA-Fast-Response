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
  updateLocation,getClientWorkStatus,reportWorkIssue,getAdminNotifications,getLocation,saveLocation,getRoutes,selectRoute
} = require('../controllers/workController');
const { 
 completeWorkAndGenerateBill ,getTechnicianSummary
} = require('../controllers/techniciancontroller');

const { getAllWorks  } = require('../controllers/statuscontrollers');


router.post('/work/create', protect, createWork);


router.post('/work/find-technicians', protect, findMatchingTechnicians);

router.post('/work/book-technician', protect, bookTechnician);


router.post('/work/start', protect,upload.single("beforePhoto"), authorize('technician'), WorkStart);
// router.post('/work/complete-1', protect, upload.single("afterphoto"),authorize('technician'),  WorkComplete  );

router.post('/work/complete', protect, authorize('technician'),upload.single("afterphoto"), completeWorkAndGenerateBill  );
router.post('/work/issue', protect, authorize('technician'), reportWorkIssue);


router.get('/getAllWork', protect, getAllWorks);// ye clinet ka saare work ko dikhayega 
// router.get("/technician/summary", protect , authorize('technician'), getTechnicianSummary);
// router.get('/issuetoadmin',getAdminNotifications);

router.patch('/work/update-location',protect,updateLocation);

router.get('/track-technician/:workId',protect,trackTechnician)

router.get('/client-work/:workId',protect, authorize('client'),getClientWorkStatus)


router.post("/savelocation", protect,authorize('client'), saveLocation);


router.get("/getlocation", protect,authorize('client'), getLocation);

router.post('/work/get-routes', protect, authorize('technician'), getRoutes);
router.put('/work/select-route/:workId', protect, authorize('technician'), selectRoute);


module.exports = router;
