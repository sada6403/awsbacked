const express = require('express');
const router = express.Router();
const {
    sendRegistrationOtp,
    sendRegistrationEmailOtp,
    verifyOtpsAndRegister,
    registerMember,
    getMyMembers,
    getRecentMembers,
    getMemberDetails,
    sendTransactionOtp
} = require('../controllers/managersMemberController');
const { protect, authorize } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotencyMiddleware');

// Send OTPs
router.post('/send-otp', protect, authorize('manager'), sendRegistrationOtp);
router.post('/send-email-otp', protect, authorize('manager'), sendRegistrationEmailOtp);
router.post('/transaction-otp', protect, authorize('manager'), sendTransactionOtp);

// Register (with OTP verification)
router.post('/verify-and-register', protect, authorize('manager'), idempotency, verifyOtpsAndRegister);
router.post('/register', protect, authorize('manager'), idempotency, registerMember);

// Get members
router.get('/recent', protect, authorize('manager'), getRecentMembers);
router.get('/:memberId', protect, authorize('manager'), getMemberDetails);
router.get('/', protect, authorize('manager'), getMyMembers);

module.exports = router;
