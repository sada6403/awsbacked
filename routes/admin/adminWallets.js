const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const WalletRequest = require('../../models/WalletRequest');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const WalletTransaction = require('../../models/WalletTransaction');
const Transaction = require('../../models/Transaction');
const { resolveRequestedBranchCodes } = require('../../utils/adminBranchFilters');
const {
  createWalletTransaction,
  getUserMeta,
  loadBranchDirectory,
  loadWalletUsersByBranchCodes,
  startOptionalSession,
} = require('../../utils/walletAdminHelpers');

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

// @route   GET /api/admin/wallets/requests
// @desc    Get all wallet requests
router.get('/requests', adminOnly, checkPermission('Wallet Requests', 'view'), async (req, res) => {
  try {
    const { requestedBranch, branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const { status, search } = req.query;
    const fvQuery = branchCodes.length > 0 ? { branchId: { $in: branchCodes } } : {};
    const fieldVisitors = await FieldVisitor.find(fvQuery, '_id branchId name fullName email phone managerId').lean();
    const fvIds = fieldVisitors.map((fv) => fv._id);
    const requestQuery = {};

    if (fvIds.length > 0 || requestedBranch) {
      requestQuery.fvId = { $in: fvIds };
    } else if (req.adminUser.role !== 'SuperAdmin') {
      requestQuery.fvId = { $in: [] };
    }
    if (status) {
      requestQuery.status = normalizeStatus(status);
    }

    const requests = await WalletRequest.find(requestQuery)
      .populate('fvId', 'name fullName email phone branchId managerId walletBalance')
      .populate('managerId', 'fullName name email phone branchId walletBalance')
      .populate('approvedBy rejectedBy processedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const branchDirectory = await loadBranchDirectory();
    const orderCounts = await Transaction.aggregate([
      { $match: { fieldVisitorId: { $in: fvIds } } },
      { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } },
    ]);
    const orderCountMap = new Map(orderCounts.map((item) => [String(item._id), item.count]));

    const filtered = requests
      .map((request) => {
        const fv = request.fvId && typeof request.fvId !== 'string' ? request.fvId : null;
        const manager = request.managerId && typeof request.managerId !== 'string' ? request.managerId : null;
        const branchCode = fv?.branchId || request.branchCode || request.branchId || manager?.branchId || null;
        const branch = branchCode ? branchDirectory.get(branchCode) : null;
        return {
          ...request,
          branchCode: branch?.branchCode || branchCode,
          branchId: branch?.branchId || request.branchId || null,
          branchName: branch?.branchName || branchCode,
          requestedUserRole: 'Field Visitor',
          orderCount: fv ? orderCountMap.get(String(fv._id)) || 0 : 0,
        };
      })
      .filter((request) => {
        if (!search) return true;
        const pattern = String(search).trim().toLowerCase();
        return JSON.stringify(request).toLowerCase().includes(pattern);
      });

    res.json({ success: true, data: filtered });
  } catch (error) {
    console.error('Fetch Wallet Requests Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/wallets/requests/:id/approve
// @desc    Approve wallet request
router.post('/requests/:id/approve', adminOnly, checkPermission('Wallet Requests', 'approve'), auditLog('Wallet Requests', 'APPROVE'), async (req, res) => {
  let session = null;

  try {
    const { adminRemarks } = req.body;
    session = await startOptionalSession();
    const sessionOptions = session ? { session } : undefined;

    const request = await WalletRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', isProcessed: { $ne: true } },
      { status: 'approved', isProcessed: true, adminRemarks, processedBy: req.adminUser._id, approvedBy: req.adminUser._id, processedAt: new Date() },
      { new: true, ...(sessionOptions || {}) }
    );

    if (!request) {
      throw Object.assign(new Error('Request not found or already processed'), { statusCode: 400 });
    }

    const fieldVisitor = await FieldVisitor.findById(request.fvId, null, sessionOptions);
    if (!fieldVisitor) {
      throw Object.assign(new Error('Field Visitor not found'), { statusCode: 404 });
    }

    fieldVisitor.walletBalance = Number(fieldVisitor.walletBalance || 0) + Number(request.amount);
    await fieldVisitor.save(sessionOptions);

    await createWalletTransaction({
      session,
      userId: fieldVisitor._id,
      userModel: 'FieldVisitor',
      type: 'input',
      amount: request.amount,
      balanceAfter: fieldVisitor.walletBalance,
      reference: `Wallet request approved by ${req.adminUser.name}`,
    });

    if (session) {
      await session.commitTransaction();
    }

    res.json({
      success: true,
      data: {
        _id: request._id,
        status: request.status,
        processedAt: request.processedAt,
        adminRemarks: request.adminRemarks,
        walletBalance: fieldVisitor.walletBalance,
      },
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  } finally {
    if (session) session.endSession();
  }
});

// @route   POST /api/admin/wallets/requests/:id/reject
// @desc    Reject wallet request
router.post('/requests/:id/reject', adminOnly, checkPermission('Wallet Requests', 'reject'), auditLog('Wallet Requests', 'REJECT'), async (req, res) => {
  try {
    const { adminRemarks } = req.body;
    const request = await WalletRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'pending', isProcessed: { $ne: true } },
      {
        status: 'rejected',
        adminRemarks,
        rejectionReason: adminRemarks,
        processedBy: req.adminUser._id,
        rejectedBy: req.adminUser._id,
        processedAt: new Date(),
        isProcessed: true,
      },
      { new: true }
    );

    if (!request) {
      return res.status(400).json({ message: 'Request not found or already processed' });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/wallets/branch-balances
// @desc    Get wallet balances grouped by branch (manager + field visitors)
router.get('/branch-balances', adminOnly, checkPermission('Wallet Requests', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const scopeQuery = branchCodes.length > 0 ? { branchId: { $in: branchCodes } } : {};

    const [managers, fieldVisitors, branchDirectory] = await Promise.all([
      BranchManager.find(scopeQuery, 'fullName name branchId walletBalance').lean(),
      FieldVisitor.find(scopeQuery, 'fullName name branchId walletBalance').lean(),
      loadBranchDirectory(),
    ]);

    const branchMap = new Map();

    for (const manager of managers) {
      const bc = manager.branchId;
      if (!bc) continue;
      const branch = branchDirectory.get(bc);
      if (!branchMap.has(bc)) {
        branchMap.set(bc, { branchCode: bc, branchName: branch?.branchName || bc, manager: null, fieldVisitors: [], totalBalance: 0 });
      }
      const entry = branchMap.get(bc);
      const bal = Number(manager.walletBalance || 0);
      entry.manager = { _id: manager._id, name: manager.fullName || manager.name || 'Manager', walletBalance: bal };
      entry.totalBalance += bal;
    }

    for (const fv of fieldVisitors) {
      const bc = fv.branchId;
      if (!bc) continue;
      const branch = branchDirectory.get(bc);
      if (!branchMap.has(bc)) {
        branchMap.set(bc, { branchCode: bc, branchName: branch?.branchName || bc, manager: null, fieldVisitors: [], totalBalance: 0 });
      }
      const entry = branchMap.get(bc);
      const bal = Number(fv.walletBalance || 0);
      entry.fieldVisitors.push({ _id: fv._id, name: fv.fullName || fv.name || 'Field Visitor', walletBalance: bal });
      entry.totalBalance += bal;
    }

    const data = Array.from(branchMap.values()).sort((a, b) => b.totalBalance - a.totalBalance);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/wallets/history
// @desc    Get wallet transaction history
router.get('/history', adminOnly, checkPermission('Wallet History', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const { managers, fieldVisitors } = await loadWalletUsersByBranchCodes(branchCodes);
    const userIds = [...managers.map((user) => user._id), ...fieldVisitors.map((user) => user._id)];
    const branchDirectory = await loadBranchDirectory();

    const history = await WalletTransaction.find(
      req.adminUser.role === 'SuperAdmin' && branchCodes.length === 0 ? {} : { userId: { $in: userIds } }
    )
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const managerMap = new Map(managers.map((item) => [String(item._id), item]));
    const fvMap = new Map(fieldVisitors.map((item) => [String(item._id), item]));

    res.json({
      success: true,
      data: history.map((entry) => {
        const user = entry.userModel === 'BranchManager' ? managerMap.get(String(entry.userId)) : fvMap.get(String(entry.userId));
        const branch = user?.branchId ? branchDirectory.get(user.branchId) : null;
        return {
          ...entry,
          userName: user?.fullName || user?.name || 'Unknown User',
          branchCode: branch?.branchCode || user?.branchId || null,
          branchName: branch?.branchName || user?.branchId || null,
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/wallets/bulk-recharge
// @desc    Bulk recharge user wallets
router.post('/bulk-recharge', adminOnly, checkPermission('Bulk Wallet Recharge', 'create'), auditLog('Wallets', 'BULK_RECHARGE'), async (req, res) => {
  let session = null;

  try {
    const { userIds, amount, reason, userModel = 'FieldVisitor' } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one user' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }

    const meta = getUserMeta(userModel);
    session = await startOptionalSession();
    const sessionOptions = session ? { session } : undefined;
    const users = await meta.Model.find({ _id: { $in: userIds } }, null, sessionOptions);

    if (users.length !== userIds.length) {
      throw Object.assign(new Error('One or more selected users were not found'), { statusCode: 404 });
    }

    for (const user of users) {
      user.walletBalance = Number(user.walletBalance || 0) + Number(amount);
      await user.save(sessionOptions);
      await createWalletTransaction({
        session,
        userId: user._id,
        userModel: meta.userModel,
        type: 'input',
        amount,
        balanceAfter: user.walletBalance,
        reference: reason || `Bulk recharge by ${req.adminUser.name}`,
      });
    }

    if (session) {
      await session.commitTransaction();
    }

    res.json({
      success: true,
      message: `Successfully recharged ${users.length} ${meta.roleLabel.toLowerCase()} wallet(s).`,
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  } finally {
    if (session) session.endSession();
  }
});

module.exports = router;
