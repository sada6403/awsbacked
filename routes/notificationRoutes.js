const express = require('express');
const router = express.Router();
const { getMyNotifications, createNotification, markNotificationsAsRead, markSingleNotificationAsRead } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getMyNotifications);
router.post('/', protect, createNotification);
router.put('/mark-read', protect, markNotificationsAsRead); // Marks all as read
router.put('/:id/mark-read', protect, markSingleNotificationAsRead); // Marks single as read

module.exports = router;
