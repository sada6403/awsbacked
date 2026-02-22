const express = require('express');
const router = express.Router();
const { getChatResponse } = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

// Route for getting AI response
// We use protect middleware to ensure only authorized users can chat
router.post('/', protect, getChatResponse);

module.exports = router;
