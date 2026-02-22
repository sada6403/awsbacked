const express = require('express');
const router = express.Router();
const { getMyNotifications, createNotification, markNotificationsAsRead } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getMyNotifications);
router.post('/', protect, createNotification);
router.put('/mark-read', protect, markNotificationsAsRead);

module.exports = router;
