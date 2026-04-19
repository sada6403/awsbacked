const express = require('express');
const router = express.Router();
const { loginUser, registerManager, updateFcmToken, resetAdminTemp, changePassword } = require('../controllers/authController');
const smsController = require('../controllers/smsController');
const { protect } = require('../middleware/authMiddleware');


router.post('/login', loginUser);
router.post('/register', registerManager);
router.post('/fcm-token', protect, updateFcmToken);
router.post('/change-password', protect, changePassword);
router.route('/manager/:id')
    .put(require('../middleware/authMiddleware').protect, require('../controllers/authController').updateManager)
    .get(require('../middleware/authMiddleware').protect, require('../controllers/authController').getManagerById);

// OTP Routes
router.post('/otp/generate', smsController.generateOtp);
router.post('/otp/verify', smsController.verifyOtp);
router.post('/verify-otp', smsController.verifyOtp); // Compatibility route for older app versions

module.exports = router;
