const express = require('express');
const router = express.Router();
const { registerFieldVisitor, getFieldVisitors, getFieldVisitorById, sendVerificationEmail } = require('../controllers/fieldVisitorController');
const { protect, authorize } = require('../middleware/authMiddleware');

// 1. Specific Routes (Must come before /:id)
// Email verification specific route
router.post('/send-otp', sendVerificationEmail);
router.get('/test-email', require('../controllers/fieldVisitorController').sendTestEmail);

// 2. Collection Routes
router.route('/')
    .post(protect, authorize('manager'), registerFieldVisitor)
    .get(protect, getFieldVisitors);

// 3. Individual Routes (Parameter-based, must be last)
router.route('/:id')
    .get(protect, getFieldVisitorById)
    .put(protect, require('../controllers/fieldVisitorController').updateFieldVisitor);

module.exports = router;
