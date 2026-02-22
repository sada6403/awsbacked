const express = require('express');
const router = express.Router();
const { registerMember, getMembers } = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotencyMiddleware');

router.route('/')
    .post(protect, authorize('field_visitor'), idempotency, registerMember)
    .get(protect, authorize('manager', 'field_visitor'), getMembers);

router.route('/:id')
    .put(protect, authorize('manager', 'field_visitor'), require('../controllers/memberController').updateMember);

router.route('/:id/pdf')
    .get(protect, authorize('manager', 'field_visitor'), require('../controllers/memberController').generateMemberPdfEndpoint);

module.exports = router;
