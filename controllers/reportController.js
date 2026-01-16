const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const Notification = require('../models/Notification');
const Note = require('../models/Note');
const mongoose = require('mongoose');

const branchFilter = (user) => ({ branchId: user.branchId || 'default-branch' });

// @desc Manager Dashboard: Field Visitors, totals (current month), pie-ready data, monthly bar chart
// @route GET /api/reports/manager-dashboard
const getManagerDashboard = async (req, res) => {
    try {
        const branchId = req.user?.branchId || 'default-branch';
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Pull all field visitors for the branch
        const fieldVisitors = await FieldVisitor.find({ branchId }).lean();

        // Contribution per field visitor from current month transactions
        const contributions = await Transaction.aggregate([
            { $match: { branchId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
            {
                $group: {
                    _id: '$fieldVisitorId',
                    totalAmount: { $sum: '$totalAmount' },
                    transactionCount: { $sum: 1 }
                }
            }
        ]);

        // Member counts per field visitor
        const memberCounts = await Member.aggregate([
            { $match: { branchId } },
            { $group: { _id: '$fieldVisitorId', memberCount: { $sum: 1 } } }
        ]);

        const contributionMap = new Map(contributions.map(c => [c._id?.toString(), c]));
        const memberMap = new Map(memberCounts.map(m => [m._id?.toString(), m.memberCount]));

        const fieldVisitorStats = fieldVisitors.map(fv => {
            const key = fv._id.toString();
            const contrib = contributionMap.get(key) || { totalAmount: 0, transactionCount: 0 };
            return {
                _id: fv._id,
                name: fv.name || fv.fullName,
                userId: fv.userId,
                phone: fv.phone,
                totalAmount: contrib.totalAmount,
                transactionCount: contrib.transactionCount,
                memberCount: memberMap.get(key) || 0
            };
        }).sort((a, b) => b.totalAmount - a.totalAmount);

        const totalBranchAmount = fieldVisitorStats.reduce((sum, fv) => sum + fv.totalAmount, 0);
        const totalTransactions = fieldVisitorStats.reduce((sum, fv) => sum + fv.transactionCount, 0);
        const totalMembers = fieldVisitorStats.reduce((sum, fv) => sum + fv.memberCount, 0);

        const pie = {
            total: totalBranchAmount,
            slices: fieldVisitorStats.map(fv => ({
                label: fv.name || fv.userId,
                value: fv.totalAmount,
                fieldVisitorId: fv._id,
                userId: fv.userId
            }))
        };

        // Bar chart: monthly totals for current year
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

        const monthlyData = await Transaction.aggregate([
            { $match: { branchId, date: { $gte: startOfYear, $lte: endOfYear } } },
            {
                $group: {
                    _id: { month: { $month: '$date' }, type: '$type' },
                    totalAmount: { $sum: '$totalAmount' }
                }
            },
            { $sort: { '_id.month': 1 } }
        ]);

        const barChart = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            buy: 0,
            sell: 0
        }));

        monthlyData.forEach(item => {
            const monthIndex = item._id.month - 1;
            if (item._id.type === 'buy') {
                barChart[monthIndex].buy = item.totalAmount;
            } else if (item._id.type === 'sell') {
                barChart[monthIndex].sell = item.totalAmount;
            }
        });

        res.json({
            success: true,
            data: {
                branchId,
                totalBranchAmount,
                totalTransactions,
                totalMembers,
                fieldVisitors: fieldVisitorStats,
                pie,
                barChart
            }
        });
    } catch (error) {
        console.error('[getManagerDashboard] Error:', error.message);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc Field Visitor Dashboard: personal totals, transactions, notifications, notes, pie data
// @route GET /api/reports/field-visitor-dashboard
const getFieldVisitorDashboard = async (req, res) => {
    try {
        const branchId = req.user?.branchId || 'default-branch';
        let fieldVisitorId = req.user?._id;
        if (fieldVisitorId) fieldVisitorId = new mongoose.Types.ObjectId(fieldVisitorId);

        // Get BUY and SELL totals separately for accurate dashboard
        const transactionBreakdown = await Transaction.aggregate([
            { $match: { branchId, fieldVisitorId } },
            {
                $group: {
                    _id: '$type',
                    totalAmount: { $sum: '$totalAmount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        let buyTotal = 0;
        let sellTotal = 0;
        let buyCount = 0;
        let sellCount = 0;

        transactionBreakdown.forEach(item => {
            if (item._id === 'buy') {
                buyTotal = item.totalAmount;
                buyCount = item.count;
            } else if (item._id === 'sell') {
                sellTotal = item.totalAmount;
                sellCount = item.count;
            }
        });

        const fvTotals = {
            totalAmount: buyTotal + sellTotal,
            transactionCount: buyCount + sellCount,
            buyTotal,
            sellTotal,
            buyCount,
            sellCount
        };

        // Latest transactions for this field visitor
        const transactions = await Transaction.find({ branchId, fieldVisitorId })
            .sort({ date: -1 })
            .limit(50)
            .populate('memberId', 'name mobile memberCode branchId')
            .lean();

        // Notifications and notes (auto-fill if legacy data missing)
        let notifications = await Notification.find({ fieldVisitorId })
            .sort({ date: -1 })
            .limit(50)
            .lean();

        if (notifications.length === 0) {
            const existingIds = new Set(notifications.map(n => n.transactionId?.toString()));
            const missingTx = transactions.filter(tx => tx._id && !existingIds.has(tx._id.toString()));
            if (missingTx.length) {
                const bulk = missingTx.map(tx => ({
                    title: `${tx.type === 'sell' ? '📤 Sale' : '🛒 Purchase'} - ${tx.productName}`,
                    body: `Transaction of Rs. ${tx.totalAmount} on ${new Date(tx.date).toLocaleDateString()} for ${(tx.memberId && tx.memberId.name) || 'Member'}`,
                    date: tx.date || new Date(),
                    isRead: false,
                    transactionId: tx._id,
                    fieldVisitorId,
                    memberId: tx.memberId?._id || tx.memberId,
                    branchId,
                    userId: fieldVisitorId,
                    userRole: 'field_visitor'
                }));
                if (bulk.length) {
                    await Notification.insertMany(bulk);
                    notifications = await Notification.find({ fieldVisitorId })
                        .sort({ date: -1 })
                        .limit(50)
                        .lean();
                }
            }
        }

        const notes = await Note.find({ fieldVisitorId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        // Get current month date range for pie charts
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // BUY Pie Chart - This Visitor vs Others (by quantity)
        const buyQuantityBreakdown = await Transaction.aggregate([
            {
                $match: {
                    branchId,
                    type: 'buy',
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$fieldVisitorId',
                    totalQuantity: { $sum: '$quantity' }
                }
            }
        ]);

        let buyThisVisitor = 0;
        let buyOthers = 0;
        const buyMap = new Map(buyQuantityBreakdown.map(b => [b._id?.toString(), b.totalQuantity]));

        buyMap.forEach((qty, fvId) => {
            if (fvId === fieldVisitorId.toString()) {
                buyThisVisitor = qty;
            } else {
                buyOthers += qty;
            }
        });

        // SELL Pie Chart - This Visitor vs Others (by quantity)
        const sellQuantityBreakdown = await Transaction.aggregate([
            {
                $match: {
                    branchId,
                    type: 'sell',
                    date: { $gte: startOfMonth, $lte: endOfMonth }
                }
            },
            {
                $group: {
                    _id: '$fieldVisitorId',
                    totalQuantity: { $sum: '$quantity' }
                }
            }
        ]);

        let sellThisVisitor = 0;
        let sellOthers = 0;
        const sellMap = new Map(sellQuantityBreakdown.map(s => [s._id?.toString(), s.totalQuantity]));

        sellMap.forEach((qty, fvId) => {
            if (fvId === fieldVisitorId.toString()) {
                sellThisVisitor = qty;
            } else {
                sellOthers += qty;
            }
        });

        // Buy pie chart data
        const buyPieChart = {
            thisVisitor: buyThisVisitor,
            others: buyOthers,
            total: buyThisVisitor + buyOthers,
            slices: [
                { label: 'This Visitor', value: buyThisVisitor },
                { label: 'Others', value: buyOthers }
            ]
        };

        // Sell pie chart data
        const sellPieChart = {
            thisVisitor: sellThisVisitor,
            others: sellOthers,
            total: sellThisVisitor + sellOthers,
            slices: [
                { label: 'This Visitor', value: sellThisVisitor },
                { label: 'Others', value: sellOthers }
            ]
        };

        // Branch pie breakdown (overall contribution)
        const branchAgg = await Transaction.aggregate([
            { $match: { branchId } },
            { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
        ]);
        const branchTotal = branchAgg.reduce((sum, item) => sum + item.totalAmount, 0);
        const fvMap = new Map(branchAgg.map(i => [i._id?.toString(), i.totalAmount]));
        const branchFieldVisitors = await FieldVisitor.find({ branchId }).lean();

        const branchPie = {
            total: branchTotal,
            slices: branchFieldVisitors.map(fv => ({
                label: fv.name || fv.fullName || fv.userId,
                value: fvMap.get(fv._id.toString()) || 0,
                fieldVisitorId: fv._id,
                userId: fv.userId
            }))
        };

        res.json({
            success: true,
            data: {
                branchId,
                totals: fvTotals,
                buyPieChart,
                sellPieChart,
                branchPie,
                transactions,
                notifications,
                notes
            }
        });
    } catch (error) {
        console.error('[getFieldVisitorDashboard] Error:', error.message);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc Yearly Analysis (Jan-Dec) grouped by month
// @route GET /api/reports/yearly
const getYearlyAnalysis = async (req, res) => {
    try {
        const filter = branchFilter(req.user);
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        const yearlyData = await Transaction.aggregate([
            {
                $match: {
                    ...filter,
                    date: { $gte: startOfYear, $lte: endOfYear }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$date' },
                        type: '$type'
                    },
                    totalAmount: { $sum: '$totalAmount' }
                }
            },
            { $sort: { '_id.month': 1 } }
        ]);

        const analysis = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, buy: 0, sell: 0 }));

        yearlyData.forEach(item => {
            const monthIndex = item._id.month - 1;
            if (item._id.type === 'buy') {
                analysis[monthIndex].buy = item.totalAmount;
            } else if (item._id.type === 'sell') {
                analysis[monthIndex].sell = item.totalAmount;
            }
        });

        res.json({ success: true, data: analysis });
    } catch (error) {
        console.error('[getYearlyAnalysis] Error:', error.message);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @route GET /api/reports/dashboard-stats
// @access Private
const getDashboardStats = async (req, res) => {
    try {
        const branchId = req.user?.branchId || 'default-branch';
        const isManager = req.user?.role === 'manager';
        let userId = req.user?._id;

        if (userId && !isManager) {
            userId = new mongoose.Types.ObjectId(userId);
        }

        // Get current month's date range
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Build transaction filter
        const txFilter = {
            branchId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        };

        // If not manager, only show their own transactions
        if (!isManager) {
            txFilter.fieldVisitorId = userId;
        }

        // Get BUY and SELL totals for current month
        const monthlyBreakdown = await Transaction.aggregate([
            { $match: txFilter },
            {
                $group: {
                    _id: '$type',
                    totalAmount: { $sum: '$totalAmount' }
                }
            }
        ]);

        let buyAmount = 0;
        let sellAmount = 0;

        monthlyBreakdown.forEach(item => {
            if (item._id === 'buy') {
                buyAmount = item.totalAmount;
            } else if (item._id === 'sell') {
                sellAmount = item.totalAmount;
            }
        });

        // Get total members count
        const memberFilter = { branchId };
        if (!isManager) {
            memberFilter.fieldVisitorId = userId;
        }

        const totalMembers = await Member.countDocuments(memberFilter);

        // Get recent transactions
        const recentTxFilter = { branchId };
        if (!isManager) {
            recentTxFilter.fieldVisitorId = userId;
        }
        const transactions = await Transaction.find(recentTxFilter)
            .sort({ date: -1 })
            .limit(10)
            .populate('memberId', 'fullName name mobile')
            .lean();

        // Get notifications
        const notificationFilter = isManager ? { branchId } : { fieldVisitorId: userId };
        const notifications = await Notification.find(notificationFilter)
            .sort({ date: -1 })
            .limit(10)
            .lean();

        // Stats for pie charts (by quantity)
        // If not manager, strictly filter pie data to this user (hide 'Others')
        const pieMatch = {
            branchId,
            // date: { $gte: startOfMonth, $lte: endOfMonth }
        };

        // Date matching for strict current month filtering (matching memberController logic)
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // MongoDB $month is 1-indexed

        const dateMatch = {
            $expr: {
                $and: [
                    { $eq: [{ $year: '$date' }, currentYear] },
                    { $eq: [{ $month: '$date' }, currentMonth] }
                ]
            }
        };
        if (!isManager) {
            // pieMatch.fieldVisitorId = userId; // Allow seeing others for comparison
        }

        const buyAmountBreakdown = await Transaction.aggregate([
            {
                $match: {
                    ...pieMatch,
                    type: 'buy',
                    ...dateMatch
                }
            },
            {
                $group: {
                    _id: '$fieldVisitorId',
                    totalAmount: { $sum: '$totalAmount' }
                }
            }
        ]);

        let buyThisUser = 0;
        let buyOthers = 0;

        buyAmountBreakdown.forEach(item => {
            const fvId = item._id?.toString();
            if (fvId === userId.toString()) {
                buyThisUser = item.totalAmount;
            } else {
                buyOthers += item.totalAmount;
            }
        });

        const sellAmountBreakdown = await Transaction.aggregate([
            {
                $match: {
                    ...pieMatch,
                    type: 'sell',
                    ...dateMatch
                }
            },
            {
                $group: {
                    _id: '$fieldVisitorId',
                    totalAmount: { $sum: '$totalAmount' }
                }
            }
        ]);

        let sellThisUser = 0;
        let sellOthers = 0;

        sellAmountBreakdown.forEach(item => {
            const fvId = item._id?.toString();
            if (fvId === userId.toString()) {
                sellThisUser = item.totalAmount;
            } else {
                sellOthers += item.totalAmount;
            }
        });

        // If manager, we also want the list of field visitors for the dashboard
        let fieldVisitors = [];
        if (isManager) {
            const fvs = await FieldVisitor.find({ branchId }).lean();

            // Get stats per FV
            const fvStats = await Transaction.aggregate([
                { $match: { branchId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                {
                    $group: {
                        _id: '$fieldVisitorId',
                        totalAmount: { $sum: '$totalAmount' },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]);

            const fvMemberCounts = await Member.aggregate([
                { $match: { branchId } },
                { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } }
            ]);

            const statsMap = new Map(fvStats.map(s => [s._id?.toString(), s]));
            const countMap = new Map(fvMemberCounts.map(c => [c._id?.toString(), c.count]));

            fieldVisitors = fvs.map(fv => {
                const s = statsMap.get(fv._id.toString()) || { totalAmount: 0, transactionCount: 0 };
                return {
                    id: fv._id,
                    _id: fv._id,
                    name: fv.name || fv.fullName,
                    code: fv.userId || fv.code,
                    userId: fv.userId,
                    phone: fv.phone,
                    email: fv.email,
                    address: fv.postalAddress || fv.address || 'N/A', // Map address
                    amount: s.totalAmount,
                    totalAmount: s.totalAmount,
                    transactionCount: s.transactionCount,
                    memberCount: countMap.get(fv._id.toString()) || 0
                };
            });
        }

        // Get count of all transactions for this month/year for the branch (for managers)
        let totalTransactionsCount = 0;
        if (isManager) {
            totalTransactionsCount = await Transaction.countDocuments({ branchId });
        } else {
            totalTransactionsCount = await Transaction.countDocuments({ fieldVisitorId: userId });
        }

        res.json({
            success: true,
            data: {
                buy: { amount: buyAmount },
                sell: { amount: sellAmount },
                monthlyTotals: {
                    buyAmount,
                    sellAmount,
                    totalAmount: buyAmount + sellAmount
                },
                buyPieChart: {
                    thisVisitor: buyThisUser,
                    others: buyOthers,
                    total: buyThisUser + buyOthers
                },
                sellPieChart: {
                    thisVisitor: sellThisUser,
                    others: sellOthers,
                    total: sellThisUser + sellOthers
                },
                totalMembers,
                totalTransactions: totalTransactionsCount,
                transactions,
                notifications,
                fieldVisitors // Only populated for managers
            }
        });
    } catch (error) {
        console.error('[getDashboardStats] Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard stats',
            error: error.message
        });
    }
};

const getMemberTransactions = async (req, res) => {
    try {
        const branchId = req.user?.branchId || 'default-branch';
        let fieldVisitorId = req.user?._id;
        if (fieldVisitorId) fieldVisitorId = new mongoose.Types.ObjectId(fieldVisitorId);

        // Group transactions by member
        const memberAgg = await Transaction.aggregate([
            { $match: { branchId, fieldVisitorId } },
            {
                $group: {
                    _id: { memberId: '$memberId', type: '$type' },
                    totalAmount: { $sum: '$totalAmount' },
                    totalQuantity: { $sum: '$quantity' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const memberIds = [...new Set(memberAgg.map(a => a._id.memberId).filter(id => !!id))];
        const members = await Member.find({ _id: { $in: memberIds } }).lean();
        const memberMap = new Map(members.map(m => [m._id.toString(), m]));

        const resultsMap = new Map();
        memberAgg.forEach(item => {
            const mId = item._id.memberId?.toString();
            if (!mId) return;
            const member = memberMap.get(mId);
            if (!member) return;

            if (!resultsMap.has(mId)) {
                resultsMap.set(mId, {
                    memberName: member.name || member.fullName,
                    memberPhone: member.mobile,
                    buyTransactions: { totalAmount: 0, totalQuantity: 0, count: 0 },
                    sellTransactions: { totalAmount: 0, totalQuantity: 0, count: 0 },
                    totalAmount: 0,
                    totalQuantity: 0
                });
            }

            const data = resultsMap.get(mId);
            if (item._id.type === 'buy') {
                data.buyTransactions = {
                    totalAmount: item.totalAmount,
                    totalQuantity: item.totalQuantity,
                    count: item.count
                };
            } else if (item._id.type === 'sell') {
                data.sellTransactions = {
                    totalAmount: item.totalAmount,
                    totalQuantity: item.totalQuantity,
                    count: item.count
                };
            }
            data.totalAmount += item.totalAmount;
            data.totalQuantity += item.totalQuantity;
        });

        res.json({
            success: true,
            data: {
                memberTransactions: Array.from(resultsMap.values())
            }
        });
    } catch (error) {
        console.error('[getMemberTransactions] Error:', error.message);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

module.exports = { getManagerDashboard, getFieldVisitorDashboard, getYearlyAnalysis, getDashboardStats, getMemberTransactions };
