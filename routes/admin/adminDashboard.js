const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');

// Import models
const Branch = require('../../models/Branch');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const Member = require('../../models/Member');
const Product = require('../../models/Product');
const Transaction = require('../../models/Transaction');
const WalletRequest = require('../../models/WalletRequest');
const FraudAlert = require('../../models/FraudAlert');
const CompanyTransfer = require('../../models/CompanyTransfer');
const Notification = require('../../models/Notification');
const { applyBranchScope, getAccessibleBranchIds } = require('../../utils/adminAccess');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');
const { OFFICIAL_BRANCH_CODES } = require('../../utils/branchMaster');
const { syncBranchesFromManagers } = require('../../utils/branchSync');

// @route   GET /api/admin/dashboard
// @desc    Get top-level dashboard statistics
router.get('/', adminOnly, async (req, res) => {
  try {
    await syncBranchesFromManagers();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const transactionQuery = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : null;
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : null;
    if (dateFrom || dateTo) {
      transactionQuery.createdAt = {};
      if (dateFrom) transactionQuery.createdAt.$gte = dateFrom;
      if (dateTo) transactionQuery.createdAt.$lte = dateTo;
    }

    const branchIds = getAccessibleBranchIds(req.adminUser);
    const branchScoped = branchIds.length > 0 && req.adminUser.role !== 'SuperAdmin';

    const scopedBranchQuery = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const branchQuery = branchScoped
      ? { branchName: { $exists: true, $ne: null }, branchCode: { $in: branchIds.filter((code) => OFFICIAL_BRANCH_CODES.includes(code)) } }
      : { branchName: { $exists: true, $ne: null }, branchCode: { $in: OFFICIAL_BRANCH_CODES } };
    const todayTransactionQuery = {
      ...transactionQuery,
      $or: [{ createdAt: { $gte: today } }, { date: { $gte: today } }],
    };

    const [
      totalBranches,
      totalManagers,
      totalFieldVisitors,
      totalMembers,
      totalProducts,
      todayTransactionsCount,
      pendingWalletRequests,
      pendingCompanyTransfers,
      activeFraudAlerts,
    ] = await Promise.all([
      Branch.countDocuments(branchQuery),
      BranchManager.countDocuments(branchScoped ? { branchId: { $in: branchIds } } : {}),
      FieldVisitor.countDocuments(scopedBranchQuery),
      Member.countDocuments(scopedBranchQuery),
      Product.countDocuments(),
      Transaction.countDocuments(todayTransactionQuery),
      WalletRequest.countDocuments({ status: { $in: ['Pending', 'pending'] } }),
      CompanyTransfer.countDocuments({ status: { $in: ['Pending', 'pending'] } }),
      FraudAlert.countDocuments({ status: { $in: ['Pending', 'pending'] } }),
    ]);
    const pendingApprovals = pendingWalletRequests + pendingCompanyTransfers;

    // Aggregate buy/sell totals in one pass. Normalizing date and type here
    // avoids duplicate dashboard queries while preserving old mixed-case data.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [transactionStats] = await Transaction.aggregate([
      { $match: transactionQuery },
      {
        $addFields: {
          normalizedType: { $toLower: '$type' },
          effectiveDate: { $ifNull: ['$date', '$createdAt'] },
        },
      },
      {
        $group: {
          _id: null,
          todayRevenue: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$normalizedType', 'sell'] }, { $gte: ['$effectiveDate', today] }] },
                '$totalAmount',
                0,
              ],
            },
          },
          totalRevenue: {
            $sum: { $cond: [{ $eq: ['$normalizedType', 'sell'] }, '$totalAmount', 0] },
          },
          totalBuyAmount: {
            $sum: { $cond: [{ $eq: ['$normalizedType', 'buy'] }, '$totalAmount', 0] },
          },
          totalSellAmount: {
            $sum: { $cond: [{ $eq: ['$normalizedType', 'sell'] }, '$totalAmount', 0] },
          },
          totalBuyTransactions: {
            $sum: { $cond: [{ $eq: ['$normalizedType', 'buy'] }, 1, 0] },
          },
          totalSellTransactions: {
            $sum: { $cond: [{ $eq: ['$normalizedType', 'sell'] }, 1, 0] },
          },
        },
      },
    ]);

    const monthlyRevenueAgg = await Transaction.aggregate([
      { $match: transactionQuery },
      {
        $addFields: {
          normalizedType: { $toLower: '$type' },
          effectiveDate: { $ifNull: ['$date', '$createdAt'] },
        },
      },
      { $match: { normalizedType: 'sell', effectiveDate: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            month: { $month: '$effectiveDate' },
            year: { $year: '$effectiveDate' },
          },
          total: { $sum: '$totalAmount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get recent transactions
    const recentTransactions = await Transaction.find(transactionQuery)
      .sort({ createdAt: -1, date: -1 })
      .limit(5)
      .lean();
    const recentTransactionBranchCodes = [...new Set(recentTransactions.map((transaction) => transaction.branchId).filter(Boolean))];
    const recentTransactionBranches = await Branch.find(
      { branchName: { $exists: true, $ne: null }, branchCode: { $in: recentTransactionBranchCodes.filter((code) => OFFICIAL_BRANCH_CODES.includes(code)) } },
      'branchCode branchName'
    ).lean();
    const recentTransactionBranchMap = new Map(recentTransactionBranches.map((branch) => [branch.branchCode, branch.branchName]));

    // Wallet balance totals across all managers and field visitors
    const [managerWalletAgg, fvWalletAgg] = await Promise.all([
      BranchManager.aggregate([{ $group: { _id: null, total: { $sum: '$walletBalance' } } }]),
      FieldVisitor.aggregate([{ $group: { _id: null, total: { $sum: '$walletBalance' } } }]),
    ]);
    const totalWalletAmount = (managerWalletAgg[0]?.total || 0) + (fvWalletAgg[0]?.total || 0);

    // Get recent wallet requests
    const recentWalletRequests = await WalletRequest.find()
      .populate('fvId', 'name fullName')
      .populate('managerId', 'fullName name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentNotifications = await Notification.find(
      branchScoped ? { branchId: { $in: branchIds } } : {}
    )
      .sort({ createdAt: -1, date: -1 })
      .limit(5)
      .lean();

    res.json({
      success: true,
      data: {
        totalBranches,
        totalManagers,
        totalFieldVisitors,
        totalMembers,
        totalProducts,
        totalBuyTransactions: transactionStats?.totalBuyTransactions || 0,
        totalSellTransactions: transactionStats?.totalSellTransactions || 0,
        todayTransactionsCount,
        todayRevenue: transactionStats?.todayRevenue || 0,
        totalRevenue: transactionStats?.totalRevenue || 0,
        totalBuyAmount: transactionStats?.totalBuyAmount || 0,
        totalSellAmount: transactionStats?.totalSellAmount || 0,
        totalWalletAmount,
        totalReleaseAmount: (transactionStats?.totalBuyAmount || 0) + totalWalletAmount,
        pendingWalletRequests,
        pendingCompanyTransfers,
        pendingApprovals,
        activeFraudAlerts,
        monthlyRevenue: monthlyRevenueAgg,
        recentTransactions: recentTransactions.map((transaction) => ({
          ...transaction,
          branchName: recentTransactionBranchMap.get(transaction.branchId) || transaction.branchId,
        })),
        recentWalletRequests,
        recentNotifications,
      }
    });

  } catch (error) {
    console.error('Dashboard Stats Error DETAILS:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ message: 'Server Error', details: error.message });
  }
});

module.exports = router;
