const express = require("express");
const router = express.Router();
const { addServiceIfWorkCompleted } = require("../controllers/servicecontroller");

router.post("/add", addServiceIfWorkCompleted);

module.exports = router;
