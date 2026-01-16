const express = require('express');
const router = express.Router();
const { registerFieldVisitor, getFieldVisitors, sendVerificationEmail } = require('../controllers/fieldVisitorController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('manager'), registerFieldVisitor)
    .get(protect, getFieldVisitors);

// Email verification specific route
router.post('/send-otp', sendVerificationEmail);

module.exports = router;
