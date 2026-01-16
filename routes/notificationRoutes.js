const express = require('express');
const router = express.Router();
const { getMyNotifications, createNotification } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getMyNotifications);
router.post('/', protect, createNotification);

module.exports = router;
