const express = require('express');
const router = express.Router();
const { createTransaction, getTransactions, downloadBill } = require('../controllers/transactionController');
const { protect, authorize } = require('../middleware/authMiddleware');
const idempotency = require('../middleware/idempotencyMiddleware');

router.route('/')
    .post(protect, authorize('manager', 'field_visitor'), idempotency, createTransaction)
    .get(protect, authorize('manager', 'field_visitor'), getTransactions);

// Download bill and create notification
router.get('/:id/download-bill', protect, authorize('manager', 'field_visitor'), downloadBill);

module.exports = router;
