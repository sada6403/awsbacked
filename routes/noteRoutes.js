const express = require('express');
const router = express.Router();
const { getMyNotes, createNote, updateNote, deleteNote } = require('../controllers/noteController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require field_visitor role
router.use(protect, authorize('field_visitor'));

router.route('/')
    .get(getMyNotes)
    .post(createNote);

router.route('/:id')
    .put(updateNote)
    .delete(deleteNote);

module.exports = router;
