const express = require('express');
const router = express.Router();
const { registerFieldVisitor, getFieldVisitors, getFieldVisitorById, sendVerificationEmail } = require('../controllers/fieldVisitorController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('manager'), registerFieldVisitor)
    .get(protect, getFieldVisitors);

router.route('/:id')
    .get(protect, getFieldVisitorById);

// Email verification specific route
router.post('/send-otp', sendVerificationEmail);

module.exports = router;
