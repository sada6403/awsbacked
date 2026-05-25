const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Branch = require('../../models/Branch');
const BranchManager = require('../../models/BranchManager');
const Member = require('../../models/Member');
const FieldVisitor = require('../../models/FieldVisitor');
const Transaction = require('../../models/Transaction');
const { canAccessBranch, getAccessibleBranchIds } = require('../../utils/adminAccess');
const {
  OFFICIAL_BRANCHES,
  buildOfficialBranchQuery,
  buildBranchId,
  getOfficialBranchByCode,
  getOfficialBranchByName,
  normalizeBranchCode,
} = require('../../utils/branchMaster');
const { resolveRequestedBranchCodes } = require('../../utils/adminBranchFilters');
const { syncBranchesFromManagers } = require('../../utils/branchSync');

function formatBranchSummary(branch, manager, stats = {}) {
  const branchId = branch.branchId || buildBranchId(branch.branchCode);
  return {
    _id: branch._id,
    branchName: branch.branchName,
    branchCode: branch.branchCode,
    branchId,
    name: branch.branchName,
    address: branch.address,
    phone: branch.phone,
    email: branch.email,
    location: branch.address || null,
    status: branch.status,
    assignedManager: manager ? manager.fullName || manager.name : 'No Manager Assigned',
    memberCount: stats.memberCount || 0,
    fieldVisitorCount: stats.fieldVisitorCount || 0,
    totalBuyTransactions: stats.totalBuyTransactions || 0,
    totalSellTransactions: stats.totalSellTransactions || 0,
    totalAmount: stats.totalAmount || 0,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
  };
}

async function buildBranchStats(branchCode) {
  const [memberCount, fieldVisitorCount, transactionAgg] = await Promise.all([
    Member.countDocuments({ branchId: branchCode }),
    FieldVisitor.countDocuments({ branchId: branchCode }),
    Transaction.aggregate([
      { $match: { branchId: branchCode } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$totalAmount' },
          totalBuyTransactions: {
            $sum: {
              $cond: [{ $in: ['$type', ['buy', 'Buy', 'BUY']] }, 1, 0],
            },
          },
          totalSellTransactions: {
            $sum: {
              $cond: [{ $in: ['$type', ['sell', 'Sell', 'SELL']] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  return {
    memberCount,
    fieldVisitorCount,
    totalAmount: transactionAgg[0]?.totalAmount || 0,
    totalBuyTransactions: transactionAgg[0]?.totalBuyTransactions || 0,
    totalSellTransactions: transactionAgg[0]?.totalSellTransactions || 0,
  };
}

async function resolveBranchPayload(payload, existingBranch = null) {
  const requestedCode = normalizeBranchCode(payload.branchCode || existingBranch?.branchCode);
  if (!requestedCode) {
    const error = new Error('Branch code is required');
    error.statusCode = 400;
    throw error;
  }

  // Use official branch data if code matches, otherwise accept the provided values directly
  const officialBranch = getOfficialBranchByCode(requestedCode);
  const branchName = officialBranch?.branchName || payload.branchName || existingBranch?.branchName || requestedCode;
  const branchId = existingBranch?.branchId || payload.branchId || officialBranch?.branchId || buildBranchId(requestedCode);

  return {
    branchName,
    branchCode: requestedCode,
    branchId,
    address: payload.address || '',
    phone: payload.phone || '',
    email: payload.email || '',
    status: payload.status || existingBranch?.status || 'active',
  };
}

// @route   GET /api/admin/branches/master-data
// @desc    Get the official branch master list
router.get('/master-data', adminOnly, checkPermission('Branches', 'view'), async (req, res) => {
  res.json({ success: true, data: OFFICIAL_BRANCHES });
});

// @route   GET /api/admin/branches
// @desc    Get all branches
router.get('/', adminOnly, checkPermission('Branches', 'view'), async (req, res) => {
  try {
    const { search, status } = req.query;
    const allowedBranchCodes = getAccessibleBranchIds(req.adminUser);
    const query = buildOfficialBranchQuery();

    if (req.adminUser.role !== 'SuperAdmin' && allowedBranchCodes.length > 0) {
      query.branchCode = { $in: allowedBranchCodes };
    }

    if (status) {
      query.status = String(status).trim().toLowerCase();
    }

    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [
        { branchName: pattern },
        { branchCode: pattern },
        { branchId: pattern },
        { address: pattern },
        { phone: pattern },
        { email: pattern },
      ];
    }

    const { branchCodes: requestedBranchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    if (requestedBranchCodes.length > 0) {
      query.branchCode = { $in: requestedBranchCodes };
    }

    const branches = await Branch.find(query).sort({ createdAt: -1 }).lean();
    const branchCodes = branches.map((branch) => branch.branchCode);

    const [managers, memberCounts, fieldVisitorCounts, transactionStats] = await Promise.all([
      BranchManager.find({ branchId: { $in: branchCodes } }, 'branchId fullName name').lean(),
      Member.aggregate([{ $match: { branchId: { $in: branchCodes } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      FieldVisitor.aggregate([{ $match: { branchId: { $in: branchCodes } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      Transaction.aggregate([
        { $match: { branchId: { $in: branchCodes } } },
        {
          $group: {
            _id: '$branchId',
            totalAmount: { $sum: '$totalAmount' },
            totalBuyTransactions: {
              $sum: { $cond: [{ $in: ['$type', ['buy', 'Buy', 'BUY']] }, 1, 0] },
            },
            totalSellTransactions: {
              $sum: { $cond: [{ $in: ['$type', ['sell', 'Sell', 'SELL']] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    const managerMap = new Map(managers.map((manager) => [manager.branchId, manager]));
    const memberCountMap = new Map(memberCounts.map((item) => [item._id, item.count]));
    const fieldVisitorCountMap = new Map(fieldVisitorCounts.map((item) => [item._id, item.count]));
    const transactionStatsMap = new Map(transactionStats.map((item) => [item._id, item]));

    res.json({
      success: true,
      data: branches.map((branch) =>
        formatBranchSummary(branch, managerMap.get(branch.branchCode), {
          memberCount: memberCountMap.get(branch.branchCode),
          fieldVisitorCount: fieldVisitorCountMap.get(branch.branchCode),
          totalAmount: transactionStatsMap.get(branch.branchCode)?.totalAmount,
          totalBuyTransactions: transactionStatsMap.get(branch.branchCode)?.totalBuyTransactions,
          totalSellTransactions: transactionStatsMap.get(branch.branchCode)?.totalSellTransactions,
        })
      ),
    });
  } catch (error) {
    console.error('Fetch Branches Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/branches/:id
// @desc    Get a branch details view
router.get('/:id', adminOnly, checkPermission('Branches', 'view'), async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, ...buildOfficialBranchQuery() }).lean();
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (!canAccessBranch(req.adminUser, branch.branchCode)) {
      return res.status(403).json({ message: 'You cannot view this branch' });
    }

    const [manager, fieldVisitors, members, transactionStats] = await Promise.all([
      BranchManager.findOne({ branchId: branch.branchCode }, 'fullName name email phone status branchId branchName userId').lean(),
      FieldVisitor.find({ branchId: branch.branchCode }, 'name fullName email phone managerId status branchId').sort({ createdAt: -1 }).lean(),
      Member.find({ branchId: branch.branchCode }, 'name mobile nic status fieldVisitorId registeredAt createdAt').sort({ createdAt: -1 }).lean(),
      buildBranchStats(branch.branchCode),
    ]);

    res.json({
      success: true,
      data: {
        ...formatBranchSummary(branch, manager, transactionStats),
        manager: manager || null,
        fieldVisitors,
        members,
      },
    });
  } catch (error) {
    console.error('Fetch Branch Details Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/branches
// @desc    Create a branch + optional manager
router.post('/', adminOnly, checkPermission('Branches', 'create'), auditLog('Branches', 'CREATE'), async (req, res) => {
  try {
    const { branchData, managerData } = req.body;
        const payload = await resolveBranchPayload(branchData || req.body);

    if (!canAccessBranch(req.adminUser, payload.branchCode)) {
      return res.status(403).json({ message: 'You cannot create this branch' });
    }

    const existingBranch = await Branch.findOne({ branchCode: payload.branchCode }).lean();
    if (existingBranch) {
      return res.status(400).json({ message: 'Branch code already exists' });
    }

    const savedBranch = await new Branch(payload).save();

    if (managerData && managerData.userId) {
      const newManager = new BranchManager({
        ...managerData,
        branchId: savedBranch.branchCode,
        branchName: savedBranch.branchName,
        password: managerData.password || '123456',
        status: managerData.status || 'active',
      });
      await newManager.save();
    }

    res.status(201).json({ success: true, data: savedBranch });
  } catch (error) {
    console.error('Create Branch Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   PUT /api/admin/branches/:id
// @desc    Update a branch
router.put('/:id', adminOnly, checkPermission('Branches', 'edit'), auditLog('Branches', 'UPDATE'), async (req, res) => {
  try {
    const existingBranch = await Branch.findOne({ _id: req.params.id, ...buildOfficialBranchQuery() });
    if (!existingBranch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (!canAccessBranch(req.adminUser, existingBranch.branchCode)) {
      return res.status(403).json({ message: 'You cannot update this branch' });
    }

    const payload = await resolveBranchPayload(req.body, existingBranch);
    const conflict = await Branch.findOne({
      _id: { $ne: req.params.id },
      branchCode: payload.branchCode,
    }).lean();
    if (conflict) {
      return res.status(400).json({ message: 'Branch code already exists' });
    }

    const updatedBranch = await Branch.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    await Promise.all([
      BranchManager.updateMany({ branchId: existingBranch.branchCode }, { branchId: payload.branchCode, branchName: payload.branchName }),
      FieldVisitor.updateMany({ branchId: existingBranch.branchCode }, { branchId: payload.branchCode }),
      Member.updateMany({ branchId: existingBranch.branchCode }, { branchId: payload.branchCode }),
      Transaction.updateMany({ branchId: existingBranch.branchCode }, { branchId: payload.branchCode }),
    ]);

    res.json({ success: true, data: updatedBranch });
  } catch (error) {
    console.error('Update Branch Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   DELETE /api/admin/branches/:id
// @desc    Delete a branch
router.delete('/:id', adminOnly, checkPermission('Branches', 'delete'), auditLog('Branches', 'DELETE'), async (req, res) => {
  try {
    const branch = await Branch.findOne({ _id: req.params.id, ...buildOfficialBranchQuery() });
    if (!branch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (!canAccessBranch(req.adminUser, branch.branchCode)) {
      return res.status(403).json({ message: 'You cannot delete this branch' });
    }

    const [managerCount, fieldVisitorCount, memberCount, transactionCount] = await Promise.all([
      BranchManager.countDocuments({ branchId: branch.branchCode }),
      FieldVisitor.countDocuments({ branchId: branch.branchCode }),
      Member.countDocuments({ branchId: branch.branchCode }),
      Transaction.countDocuments({ branchId: branch.branchCode }),
    ]);

    if (managerCount || fieldVisitorCount || memberCount || transactionCount) {
      return res.status(400).json({ message: 'Cannot delete branch with linked managers, field visitors, members, or transactions' });
    }

    await Branch.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Branch deleted successfully' });
  } catch (error) {
    console.error('Delete Branch Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/branches/:id/block
// @desc    Block a branch
router.post('/:id/block', adminOnly, checkPermission('Branches', 'block'), auditLog('Branches', 'BLOCK'), async (req, res) => {
  try {
    const existingBranch = await Branch.findOne({ _id: req.params.id, ...buildOfficialBranchQuery() });
    if (!existingBranch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (!canAccessBranch(req.adminUser, existingBranch.branchCode)) {
      return res.status(403).json({ message: 'You cannot block this branch' });
    }

    const branch = await Branch.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/branches/:id/unblock
// @desc    Unblock a branch
router.post('/:id/unblock', adminOnly, checkPermission('Branches', 'unblock'), auditLog('Branches', 'UNBLOCK'), async (req, res) => {
  try {
    const existingBranch = await Branch.findOne({ _id: req.params.id, ...buildOfficialBranchQuery() });
    if (!existingBranch) {
      return res.status(404).json({ message: 'Branch not found' });
    }
    if (!canAccessBranch(req.adminUser, existingBranch.branchCode)) {
      return res.status(403).json({ message: 'You cannot unblock this branch' });
    }

    const branch = await Branch.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
