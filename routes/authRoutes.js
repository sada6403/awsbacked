const express = require('express');
const router = express.Router();
const { loginUser, registerManager } = require('../controllers/authController');
const smsController = require('../controllers/smsController');


router.post('/login', loginUser);
router.post('/register', registerManager);

// OTP Routes
router.post('/otp/generate', smsController.generateOtp);
router.post('/otp/verify', smsController.verifyOtp);

module.exports = router;
