const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Branch = require('../../models/Branch');
const Transaction = require('../../models/Transaction');
const { canAccessBranch } = require('../../utils/adminAccess');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(value) {
  return `LKR ${Number(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
}

// @route   GET /api/admin/transactions
// @desc    Get all transactions with optional filters
router.get('/', adminOnly, checkPermission('All Transactions', 'view'), async (req, res) => {
  try {
    const { type, status, dateFrom, dateTo, startDate, endDate, fieldVisitorId, memberId, product, search } = req.query;

    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    if (type) query.type = String(type).trim().toLowerCase();
    if (status) query.status = String(status).trim().toLowerCase();
    if (fieldVisitorId) query.fieldVisitorId = fieldVisitorId;
    if (memberId) query.memberId = memberId;
    if (product) query.productName = new RegExp(String(product).trim(), 'i');

    const from = dateFrom || startDate;
    const to = dateTo || endDate;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [{ billNumber: pattern }, { productName: pattern }, { branchId: pattern }, { status: pattern }];
    }

    const transactions = await Transaction.find(query)
      .populate('fieldVisitorId', 'name fullName')
      .populate({
        path: 'memberId',
        select: 'name mobile',
        model: 'Member' // Explicitly set model because it could be dynamic
      })
      .sort({ createdAt: -1 });
    const branchCodes = [...new Set(transactions.map((transaction) => transaction.branchId).filter(Boolean))];
    const branches = await Branch.find({ branchCode: { $in: branchCodes } }, 'branchCode branchName').lean();
    const branchNameMap = new Map(branches.map((branch) => [branch.branchCode, branch.branchName]));

    res.json({
      success: true,
      data: transactions.map((transaction) => ({
        ...transaction.toObject(),
        branchName: branchNameMap.get(transaction.branchId) || transaction.branchId,
      })),
    });
  } catch (error) {
    console.error('Fetch Transactions Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/transactions/:id
// @desc    Get single transaction
router.get('/:id', adminOnly, checkPermission('All Transactions', 'view'), async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('fieldVisitorId', 'name fullName')
      .populate({
        path: 'memberId',
        select: 'name mobile',
        model: 'Member'
      });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!canAccessBranch(req.adminUser, transaction.branchId)) {
      return res.status(403).json({ message: 'You cannot view this transaction' });
    }
    const branch = await Branch.findOne({ branchCode: transaction.branchId }, 'branchCode branchName').lean();
    res.json({ success: true, data: { ...transaction.toObject(), branchName: branch?.branchName || transaction.branchId } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/transactions/:id/receipt
// @desc    Get printable transaction bill receipt
router.get('/:id/receipt', adminOnly, checkPermission('All Transactions', 'view'), async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('fieldVisitorId', 'name fullName phone email userId')
      .populate({ path: 'memberId', select: 'name mobile email nic memberCode address', model: 'Member' })
      .lean();
    if (!transaction) return res.status(404).send('Transaction not found');
    if (!canAccessBranch(req.adminUser, transaction.branchId)) {
      return res.status(403).send('You cannot view this transaction');
    }
    const branch = await Branch.findOne({ branchCode: transaction.branchId }, 'branchCode branchName address phone email').lean();
    const member = typeof transaction.memberId === 'object' ? transaction.memberId : {};
    const fieldVisitor = typeof transaction.fieldVisitorId === 'object' ? transaction.fieldVisitorId : {};
    const receiptRef = transaction.billNumber || String(transaction._id);
    const logoUrl = `${req.protocol}://${req.get('host')}/images/nf_logo.jpg`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Bill ${escapeHtml(receiptRef)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fb; color: #101828; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 22mm; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f766e; padding-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 58px; height: 58px; object-fit: cover; border-radius: 12px; border: 1px solid #e4e7ec; }
    h1 { margin: 0; font-size: 24px; }
    .muted { color: #667085; font-size: 12px; }
    .ref { text-align: right; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
    .box { border: 1px solid #e4e7ec; border-radius: 10px; padding: 14px; }
    .box h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #0f766e; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #f2f4f7; }
    table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 13px; }
    th { background: #ecfdf3; color: #0f766e; text-align: left; padding: 12px; }
    td { border-bottom: 1px solid #e4e7ec; padding: 12px; }
    .total { margin-top: 18px; display: flex; justify-content: flex-end; }
    .total div { min-width: 260px; border-radius: 10px; background: #0f766e; color: white; padding: 16px; }
    .actions { position: sticky; top: 0; padding: 10px; background: #101828; text-align: right; }
    .actions button { border: 0; border-radius: 8px; padding: 10px 14px; background: #0f766e; color: white; cursor: pointer; }
    @media print { body { background: white; } .page { margin: 0; width: auto; min-height: auto; box-shadow: none; } .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print Bill</button></div>
  <main class="page">
    <section class="header">
      <div class="brand">
        <img src="${logoUrl}" alt="Nature Farming" />
        <div><h1>Nature Farming Receipt</h1><p class="muted">Professional transaction bill</p></div>
      </div>
      <div class="ref"><h1>${escapeHtml(receiptRef)}</h1><p class="muted">${escapeHtml(new Date(transaction.date || transaction.createdAt).toLocaleString('en-GB'))}</p></div>
    </section>
    <section class="grid">
      <div class="box"><h2>Member Details</h2><div class="row"><span>Name</span><strong>${escapeHtml(member.name || 'N/A')}</strong></div><div class="row"><span>Mobile</span><strong>${escapeHtml(member.mobile || 'N/A')}</strong></div><div class="row"><span>Code</span><strong>${escapeHtml(member.memberCode || 'N/A')}</strong></div></div>
      <div class="box"><h2>Branch Details</h2><div class="row"><span>Branch</span><strong>${escapeHtml(branch?.branchName || transaction.branchId)}</strong></div><div class="row"><span>Code</span><strong>${escapeHtml(branch?.branchCode || transaction.branchId)}</strong></div><div class="row"><span>Contact</span><strong>${escapeHtml(branch?.phone || 'N/A')}</strong></div></div>
      <div class="box"><h2>Field Visitor</h2><div class="row"><span>Name</span><strong>${escapeHtml(fieldVisitor.fullName || fieldVisitor.name || 'N/A')}</strong></div><div class="row"><span>User ID</span><strong>${escapeHtml(fieldVisitor.userId || 'N/A')}</strong></div><div class="row"><span>Phone</span><strong>${escapeHtml(fieldVisitor.phone || 'N/A')}</strong></div></div>
      <div class="box"><h2>Transaction</h2><div class="row"><span>Type</span><strong>${escapeHtml(transaction.type)}</strong></div><div class="row"><span>Status</span><strong>${escapeHtml(transaction.status)}</strong></div><div class="row"><span>Reference</span><strong>${escapeHtml(receiptRef)}</strong></div></div>
    </section>
    <table><thead><tr><th>Product</th><th>Quantity</th><th>Unit</th><th>Unit Price</th><th>Total</th></tr></thead><tbody><tr><td>${escapeHtml(transaction.productName)}</td><td>${escapeHtml(transaction.quantity)}</td><td>${escapeHtml(transaction.unitType)}</td><td>${escapeHtml(formatMoney(transaction.unitPrice))}</td><td>${escapeHtml(formatMoney(transaction.totalAmount))}</td></tr></tbody></table>
    <div class="total"><div><span>Total Amount</span><h1>${escapeHtml(formatMoney(transaction.totalAmount))}</h1></div></div>
  </main>
</body>
</html>`);
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message || 'Server Error');
  }
});

// @route   PUT /api/admin/transactions/:id
// @desc    Edit bill details without deleting transaction history
router.put('/:id', adminOnly, checkPermission('All Transactions', 'edit'), auditLog('Transactions', 'UPDATE_BILL'), async (req, res) => {
  try {
    const existingTransaction = await Transaction.findById(req.params.id);
    if (!existingTransaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!canAccessBranch(req.adminUser, existingTransaction.branchId)) {
      return res.status(403).json({ message: 'You cannot edit this transaction' });
    }

    const quantity = req.body.quantity === undefined ? existingTransaction.quantity : Number(req.body.quantity);
    const unitPrice = req.body.unitPrice === undefined ? existingTransaction.unitPrice : Number(req.body.unitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ message: 'Quantity and unit price are invalid' });
    }

    const update = {
      productName: req.body.productName || existingTransaction.productName,
      quantity,
      unitType: req.body.unitType || existingTransaction.unitType,
      unitPrice,
      totalAmount: Number(req.body.totalAmount ?? quantity * unitPrice),
      date: req.body.date ? new Date(req.body.date) : existingTransaction.date,
    };
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/transactions/:id/hold
// @desc    Hold a suspicious transaction
router.post('/:id/hold', adminOnly, checkPermission('All Transactions', 'edit'), auditLog('Transactions', 'HOLD'), async (req, res) => {
  try {
    const existingTransaction = await Transaction.findById(req.params.id);
    if (!existingTransaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!canAccessBranch(req.adminUser, existingTransaction.branchId)) {
      return res.status(403).json({ message: 'You cannot hold this transaction' });
    }
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, { status: 'held' }, { new: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/transactions/:id/approve
// @desc    Approve a held transaction
router.post('/:id/approve', adminOnly, checkPermission('All Transactions', 'approve'), auditLog('Transactions', 'APPROVE'), async (req, res) => {
  try {
    const existingTransaction = await Transaction.findById(req.params.id);
    if (!existingTransaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!canAccessBranch(req.adminUser, existingTransaction.branchId)) {
      return res.status(403).json({ message: 'You cannot approve this transaction' });
    }
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, { status: 'completed' }, { new: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/transactions/:id/reject
// @desc    Reject a transaction
router.post('/:id/reject', adminOnly, checkPermission('All Transactions', 'reject'), auditLog('Transactions', 'REJECT'), async (req, res) => {
  try {
    const existingTransaction = await Transaction.findById(req.params.id);
    if (!existingTransaction) return res.status(404).json({ message: 'Transaction not found' });
    if (!canAccessBranch(req.adminUser, existingTransaction.branchId)) {
      return res.status(403).json({ message: 'You cannot reject this transaction' });
    }
    const transaction = await Transaction.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true });
    if (!transaction) return res.status(404).json({ message: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
