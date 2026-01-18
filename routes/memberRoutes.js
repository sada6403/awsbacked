const express = require('express');
const router = express.Router();
const { registerMember, getMembers } = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorize('field_visitor'), registerMember)
    .get(protect, authorize('manager', 'field_visitor'), getMembers);

router.route('/:id')
    .put(protect, authorize('manager', 'field_visitor'), require('../controllers/memberController').updateMember);

module.exports = router;
