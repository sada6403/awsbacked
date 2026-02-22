const express = require('express');
const router = express.Router();
const { addExtraMember, getDailyProgress, getExtraMembers } = require('../controllers/extraMemberController');
const { protect } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotencyMiddleware');

router.post('/', protect, idempotency, addExtraMember);
router.get('/', protect, getExtraMembers);
router.get('/progress/:fieldVisitorId', protect, getDailyProgress);

module.exports = router;
