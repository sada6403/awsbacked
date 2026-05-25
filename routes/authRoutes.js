const express = require('express');
const router = express.Router();
const { loginUser, registerManager, updateFcmToken } = require('../controllers/authController');
const smsController = require('../controllers/smsController');
const { protect } = require('../middleware/authMiddleware');


router.post('/login', loginUser);
router.post('/register', registerManager);
router.post('/fcm-token', protect, updateFcmToken);
router.route('/manager/:id')
    .put(require('../middleware/authMiddleware').protect, require('../controllers/authController').updateManager)
    .get(require('../middleware/authMiddleware').protect, require('../controllers/authController').getManagerById);

// OTP Routes
router.post('/otp/generate', smsController.generateOtp);
router.post('/otp/verify', smsController.verifyOtp);

module.exports = router;
