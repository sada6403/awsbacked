const express = require('express');
const router = express.Router();
const { getTotals, getAllNotifications, getAllNotes, getAll } = require('../controllers/debugController');

// Public debug endpoints (do not enable in production without protecting them)
router.get('/totals', getTotals);
router.get('/notifications', getAllNotifications);
router.get('/notes', getAllNotes);
router.get('/all', getAll);

module.exports = router;
