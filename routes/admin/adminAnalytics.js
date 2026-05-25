const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const Transaction = require('../../models/Transaction');
const WalletRequest = require('../../models/WalletRequest');
const CompanyTransfer = require('../../models/CompanyTransfer');
const Branch = require('../../models/Branch');
const FieldVisitor = require('../../models/FieldVisitor');
const BranchManager = require('../../models/BranchManager');
const ManagersMember = require('../../models/ManagersMember');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');

function buildDateMatch(query, field = 'date') {
  const from = query.dateFrom || query.startDate;
  const to = query.dateTo || query.endDate;
  if (!from && !to) return null;
  const match = {};
  if (from) match.$gte = new Date(from);
  if (to) match.$lte = new Date(to);
  return { [field]: match };
}

router.get('/', adminOnly, checkPermission('Analytics', 'view'), async (req, res) => {
  try {
    const txMatch = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const createdAtMatch = buildDateMatch(req.query, 'createdAt');
    const dateMatch = buildDateMatch(req.query, 'date');
    if (dateMatch) Object.assign(txMatch, dateMatch);
    const baseCreatedAtMatch = createdAtMatch ? createdAtMatch.createdAt : {};
    const walletBranchFilter = txMatch.branchId ? { branchCode: { $in: txMatch.branchId.$in } } : {};

    const managerBranchMatch = txMatch.branchId ? { branchId: { $in: txMatch.branchId.$in } } : {};

    const [monthlyTransactions, branchPerformance, fvPerformance, managerDocs, walletStats, transferStats] = await Promise.all([
      Transaction.aggregate([
        { $match: txMatch },
        {
          $group: {
            _id: {
              month: { $month: '$date' },
              year: { $year: '$date' },
              type: '$type',
            },
            totalAmount: { $sum: '$totalAmount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Transaction.aggregate([
        { $match: txMatch },
        { $group: { _id: '$branchId', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { totalAmount: -1 } },
      ]),
      Transaction.aggregate([
        { $match: { ...txMatch, fieldVisitorId: { $exists: true, $ne: null } } },
        { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
        { $sort: { totalAmount: -1 } },
        { $limit: 10 },
      ]),
      BranchManager.find(managerBranchMatch, 'fullName name branchId').sort({ fullName: 1 }).lean(),
      WalletRequest.aggregate([
        { $match: { ...walletBranchFilter, ...(Object.keys(baseCreatedAtMatch).length ? { createdAt: baseCreatedAtMatch } : {}) } },
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
      CompanyTransfer.aggregate([
        { $match: { ...walletBranchFilter, ...(Object.keys(baseCreatedAtMatch).length ? { createdAt: baseCreatedAtMatch } : {}) } },
        { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
      ]),
    ]);

    const branchCodes = branchPerformance.map((item) => item._id).filter(Boolean);
    const branchDocs = await Branch.find({ branchCode: { $in: branchCodes } }, 'branchCode branchName').lean();
    const branchMap = new Map(branchDocs.map((branch) => [branch.branchCode, branch.branchName]));

    const fvIds = fvPerformance.map((item) => item._id).filter(Boolean);
    const managerIds = managerDocs.map((item) => item._id).filter(Boolean);
    const [fvDocs, managerMemberCounts, fieldWorkerCounts] = await Promise.all([
      FieldVisitor.find({ _id: { $in: fvIds } }, 'name fullName').lean(),
      ManagersMember.aggregate([
        { $match: { addedBy: { $in: managerIds }, ...(txMatch.branchId ? { branchId: { $in: txMatch.branchId.$in } } : {}) } },
        { $group: { _id: '$addedBy', count: { $sum: 1 } } },
      ]),
      FieldVisitor.aggregate([
        { $match: { managerId: { $in: managerIds }, ...(txMatch.branchId ? { branchId: { $in: txMatch.branchId.$in } } : {}) } },
        { $group: { _id: '$managerId', count: { $sum: 1 } } },
      ]),
    ]);
    const fvMap = new Map(fvDocs.map((item) => [String(item._id), item.fullName || item.name]));
    const managerMemberMap = new Map(managerMemberCounts.map((item) => [String(item._id), item.count]));
    const fieldWorkerMap = new Map(fieldWorkerCounts.map((item) => [String(item._id), item.count]));

    res.json({
      success: true,
      data: {
        monthlyTransactions: monthlyTransactions.map((item) => ({
          month: item._id.month,
          year: item._id.year,
          type: item._id.type,
          totalAmount: item.totalAmount,
        })),
        branchPerformance: branchPerformance.map((item) => ({
          branchCode: item._id,
          branchName: branchMap.get(item._id) || item._id,
          totalAmount: item.totalAmount,
          count: item.count,
        })),
        fieldVisitorPerformance: fvPerformance.map((item) => ({
          fieldVisitorId: item._id,
          fieldVisitorName: fvMap.get(String(item._id)) || 'Unknown Field Visitor',
          totalAmount: item.totalAmount,
          count: item.count,
        })),
        managerPerformance: managerDocs.map((item) => ({
          managerId: item._id,
          managerName: item.fullName || item.name || 'No Manager Assigned',
          branchId: item.branchId,
          members: managerMemberMap.get(String(item._id)) || 0,
          fieldWorkers: fieldWorkerMap.get(String(item._id)) || 0,
          leads: fieldWorkerMap.get(String(item._id)) || 0,
        })),
        walletStats,
        companyTransferStats: transferStats,
      },
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
