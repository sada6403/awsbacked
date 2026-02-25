const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const Notification = require('../models/Notification');
const Note = require('../models/Note');
const ManagersMember = require('../models/ManagersMember');
const ExtraMember = require('../models/ExtraMember');
const mongoose = require('mongoose');

const BranchManager = require('../models/BranchManager');

const branchFilter = (user) => ({ branchId: user.branchId || 'default-branch' });

// @desc Manager Dashboard: Field Visitors, totals (current month), pie-ready data, monthly bar chart
// @route GET /api/reports/manager-dashboard
const getManagerDashboard = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

        // Sanitize branchId for robust matching
        const branchId = (req.user?.branchId || 'default-branch').toLowerCase();

        // Broaden branchId search to handle case inconsistencies or default-branch legacy data
        const branchMatch = {
            $or: [
                { branchId: branchId },
                { branchId: branchId.toUpperCase() },
                { branchId: 'default-branch' }
            ]
        };

        // Efficiently fetch all branch data in parallel
        const [
            fieldVisitors,
            contributions,
            [extraMemberCounts, centralMemberCounts],
            leadCounts,
            managerMemberCounts,
            notifications,
            unreadNotificationsCount,
            manager,
            monthlyData
        ] = await Promise.all([
            FieldVisitor.find({ branchId }).lean(),
            Transaction.aggregate([
                { $match: { ...branchMatch, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                {
                    $group: {
                        _id: { fieldVisitorId: '$fieldVisitorId', type: '$type' },
                        totalAmount: { $sum: '$totalAmount' },
                        transactionCount: { $sum: 1 }
                    }
                }
            ]),
            // Members count (combined)
            FieldVisitor.find({ branchId }).select('_id').then(visitors => {
                const visitorIds = visitors.map(v => v._id);
                visitorIds.push(new mongoose.Types.ObjectId(req.user._id));
                return Promise.all([
                    ExtraMember.aggregate([
                        { $match: { collectedBy: { $in: visitorIds }, memberCode: { $exists: true, $ne: null, $ne: '' } } },
                        { $group: { _id: '$collectedBy', memberCount: { $sum: 1 } } }
                    ]),
                    Member.aggregate([
                        { $match: { fieldVisitorId: { $in: visitorIds } } },
                        { $group: { _id: '$fieldVisitorId', memberCount: { $sum: 1 } } }
                    ])
                ]);
            }),
            // Leads
            FieldVisitor.find({ branchId }).select('_id').then(visitors => {
                const visitorIds = visitors.map(v => v._id);
                visitorIds.push(new mongoose.Types.ObjectId(req.user._id));
                return ExtraMember.aggregate([
                    {
                        $match: {
                            collectedBy: { $in: visitorIds },
                            $or: [{ memberCode: { $exists: false } }, { memberCode: null }, { memberCode: '' }]
                        }
                    },
                    { $group: { _id: '$collectedBy', leadCount: { $sum: 1 } } }
                ]);
            }),
            // Manager's own
            ManagersMember.aggregate([
                { $match: { addedBy: new mongoose.Types.ObjectId(req.user._id) } },
                { $group: { _id: '$addedBy', count: { $sum: 1 } } }
            ]),
            Notification.find({ userId: req.user._id }).sort({ date: -1 }).limit(10).lean(),
            Notification.countDocuments({ userId: req.user._id, isRead: false }),
            BranchManager.findById(req.user._id).lean(),
            Transaction.aggregate([
                { $match: { ...branchMatch, date: { $gte: startOfYear, $lte: endOfYear } } },
                {
                    $group: {
                        _id: { month: { $month: '$date' }, type: '$type' },
                        totalAmount: { $sum: '$totalAmount' }
                    }
                },
                { $sort: { '_id.month': 1 } }
            ])
        ]);

        const contributionMap = new Map();
        let branchBuyAmount = 0;
        let branchSellAmount = 0;

        contributions.forEach(c => {
            const fvId = c._id.fieldVisitorId?.toString();
            if (!contributionMap.has(fvId)) {
                contributionMap.set(fvId, { totalAmount: 0, transactionCount: 0 });
            }
            const fvContrib = contributionMap.get(fvId);
            fvContrib.totalAmount += c.totalAmount;
            fvContrib.transactionCount += c.transactionCount;

            if (c._id.type === 'buy') branchBuyAmount += c.totalAmount;
            else if (c._id.type === 'sell') branchSellAmount += c.totalAmount;
        });

        const memberMap = new Map(centralMemberCounts.map(m => [m._id?.toString(), m.memberCount]));
        const leadMap = new Map(leadCounts.map(l => [l._id?.toString(), l.leadCount]));
        const managerMap = new Map(managerMemberCounts.map(m => [m._id?.toString(), m.count]));

        const fieldVisitorStats = fieldVisitors.map(fv => {
            const key = fv._id.toString();
            const contrib = contributionMap.get(key) || { totalAmount: 0, transactionCount: 0 };
            let totalMembers = memberMap.get(key) || 0;
            if (key === req.user._id.toString()) totalMembers += (managerMap.get(key) || 0);

            return {
                _id: fv._id,
                name: fv.name || fv.fullName,
                userId: fv.userId,
                phone: fv.phone,
                email: fv.email,
                address: fv.postalAddress || fv.permanentAddress || 'N/A',
                totalAmount: contrib.totalAmount,
                amount: contrib.totalAmount,
                transactionCount: contrib.transactionCount,
                memberCount: totalMembers,
                leadCount: leadMap.get(key) || 0
            };
        }).sort((a, b) => b.totalAmount - a.totalAmount);

        const walletBalance = manager?.walletBalance || 0;
        const totalBranchAmount = fieldVisitorStats.reduce((sum, fv) => sum + fv.totalAmount, 0);
        const totalTransactions = fieldVisitorStats.reduce((sum, fv) => sum + fv.transactionCount, 0);
        const totalMembers = fieldVisitorStats.reduce((sum, fv) => sum + fv.memberCount, 0);
        const managersMemberCount = managerMap.get(req.user._id.toString()) || 0;

        // Recent items (merged)
        const [recentMgrMembers, recentExtMembers] = await Promise.all([
            ManagersMember.find({ addedBy: req.user._id }).sort({ createdAt: -1 }).limit(10).lean(),
            ExtraMember.find({ collectedBy: req.user._id }).sort({ collectedAt: -1 }).limit(10).lean()
        ]);

        const recentManagerMembers = [...recentMgrMembers, ...recentExtMembers]
            .sort((a, b) => new Date(b.createdAt || b.collectedAt || 0) - new Date(a.createdAt || a.collectedAt || 0))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                branchId,
                walletBalance,
                buy: { amount: branchBuyAmount },
                sell: { amount: branchSellAmount },
                totalBranchAmount,
                totalTransactions,
                totalMembers,
                managersMemberCount, // Added for Manager Dashboard 'Add Member' count
                fieldVisitors: fieldVisitorStats,
                notifications, // Include recent notifications
                unreadNotificationsCount, // Include total unread count
                recentManagerMembers, // --- ADDED FOR MANAGER DASHBOARD LIST ---
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
        // Sanitize branchId for robust matching
        const branchId = (req.user?.branchId || 'default-branch').toLowerCase();

        // Broaden branchId search to handle case inconsistencies or default-branch legacy data
        const branchMatch = {
            $or: [
                { branchId: branchId },
                { branchId: branchId.toUpperCase() },
                { branchId: 'default-branch' }
            ]
        };

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        let fieldVisitorId = req.user?._id;
        if (fieldVisitorId) fieldVisitorId = new mongoose.Types.ObjectId(fieldVisitorId);

        // Fetch Field Visitor info for wallet balance
        const visitor = await FieldVisitor.findById(fieldVisitorId).lean();
        const walletBalance = visitor?.walletBalance || 0;

        // Get BUY and SELL totals separately for accurate dashboard
        const transactionBreakdown = await Transaction.aggregate([
            { $match: { ...branchMatch, fieldVisitorId } },
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

        // Latest transactions for this field visitor
        const transactions = await Transaction.find({ ...branchMatch, fieldVisitorId })
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

        // Efficiently fetch all visitor data in parallel
        const [
            visitorData, // renamed to avoid conflict if any
            totals,
            notes,
            buyAmountBreakdown,
            sellAmountBreakdown,
            branchAgg,
            branchFieldVisitors,
            totalMembers,
            unreadNotificationsCount,
            monthlyLeads,
            annualLeads
        ] = await Promise.all([
            FieldVisitor.findById(fieldVisitorId).lean(),
            Transaction.aggregate([
                { $match: { fieldVisitorId } },
                { $group: { _id: '$type', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            Note.find({ fieldVisitorId }).sort({ createdAt: -1 }).limit(50).lean(),
            Transaction.aggregate([
                {
                    $match: {
                        ...branchMatch,
                        type: 'buy',
                        date: { $gte: startOfMonth, $lte: endOfMonth }
                    }
                },
                { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            Transaction.aggregate([
                {
                    $match: {
                        ...branchMatch,
                        type: 'sell',
                        date: { $gte: startOfMonth, $lte: endOfMonth }
                    }
                },
                { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            Transaction.aggregate([
                { $match: { ...branchMatch } },
                { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            FieldVisitor.find({ branchId }).lean(),
            Member.countDocuments({ fieldVisitorId }),
            Notification.countDocuments({ userId: fieldVisitorId, isRead: false }),
            ExtraMember.countDocuments({
                collectedBy: fieldVisitorId,
                collectedAt: { $gte: startOfMonth, $lte: endOfMonth }
            }),
            ExtraMember.countDocuments({
                collectedBy: fieldVisitorId,
                collectedAt: {
                    $gte: new Date(new Date().getFullYear(), 0, 1),
                    $lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
                }
            })
        ]);

        const fvTotalsFinal = { buy: 0, sell: 0 };
        totals.forEach(t => {
            if (t._id === 'buy') fvTotalsFinal.buy = t.totalAmount;
            else if (t._id === 'sell') fvTotalsFinal.sell = t.totalAmount;
        });

        const walletBalanceResult = visitorData?.walletBalance || 0;

        let buyThisVisitor = 0;
        let buyOthers = 0;
        buyAmountBreakdown.forEach(item => {
            if (item._id?.toString() === fieldVisitorId.toString()) buyThisVisitor = item.totalAmount;
            else buyOthers += item.totalAmount;
        });

        let sellThisVisitor = 0;
        let sellOthers = 0;
        sellAmountBreakdown.forEach(item => {
            if (item._id?.toString() === fieldVisitorId.toString()) sellThisVisitor = item.totalAmount;
            else sellOthers += item.totalAmount;
        });

        const branchTotal = branchAgg.reduce((sum, item) => sum + item.totalAmount, 0);
        const fvMap = new Map(branchAgg.map(i => [i._id?.toString(), i.totalAmount]));
        const branchPie = {
            total: branchTotal,
            slices: branchFieldVisitors.map(fv => ({
                label: fv.name || fv.fullName || fv.userId,
                value: fvMap.get(fv._id.toString()) || 0,
                fieldVisitorId: fv._id,
                userId: fv.userId
            }))
        };

        // For debugging missing amounts
        if (fvTotalsFinal.buy === 0 && fvTotalsFinal.sell === 0) {
            console.log(`[DEBUG] No transactions found for FV ${fieldVisitorId} in branch ${branchId}`);
        }

        res.json({
            success: true,
            data: {
                branchId,
                totals: fvTotalsFinal,
                walletBalance: walletBalanceResult,
                totalMembers,
                monthlyLeads,
                annualLeads,
                buyPieChart: {
                    thisVisitor: buyThisVisitor,
                    others: buyOthers,
                    total: buyThisVisitor + buyOthers
                },
                sellPieChart: {
                    thisVisitor: sellThisVisitor,
                    others: sellOthers,
                    total: sellThisVisitor + sellOthers
                },
                branchPie,
                transactions,
                notifications,
                unreadNotificationsCount,
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
        const isManager = req.user?.role === 'manager' || req.user?.role === 'branch_manager';
        let userId = req.user?._id;
        if (userId) userId = new mongoose.Types.ObjectId(userId);

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

        // Fetch Field Visitor info for wallet balance (needed for Rs.0.00 fix)
        let walletBalance = 0;
        if (!isManager) {
            const visitor = await FieldVisitor.findById(userId).lean();
            walletBalance = visitor?.walletBalance || 0;
        }

        // Sanitize branchId for robust matching (fallback to lowercase, then check UPPER if needed)
        const branchId = (req.user?.branchId || 'default-branch').toLowerCase();

        // 1. Transaction Filter (Monthly)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Broaden branchId search to handle case inconsistencies or default-branch legacy data
        const branchMatch = {
            $or: [
                { branchId: branchId },
                { branchId: branchId.toUpperCase() },
                { branchId: 'default-branch' }
            ]
        };

        const txFilter = {
            ...branchMatch,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        };

        // If not manager, only show their own transactions
        if (!isManager) {
            txFilter.fieldVisitorId = userId;
        }

        // Stats for pie charts
        const pieMatch = { ...branchMatch };

        // Date matching for strict current month filtering (matching memberController logic)
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // MongoDB $month is 1-indexed (Jan=1)

        const dateMatch = {
            $expr: {
                $and: [
                    { $eq: [{ $year: '$date' }, currentYear] },
                    { $eq: [{ $month: '$date' }, currentMonth] }
                ]
            }
        };

        console.log(`[getDashboardStats] User: ${userId} (${req.user?.role}) Branch: ${branchId} Month: ${currentMonth}`);

        // Efficiently fetch all required counts and data in parallel
        const [
            monthlyBreakdown,
            notifications,
            unreadNotificationsCount,
            buyAmountBreakdown,
            sellAmountBreakdown,
            monthlyLeads,
            totalLeads,
            annualLeads,
            managersMemberCount,
            totalTransactionsCount
        ] = await Promise.all([
            // 1. Monthly Transaction Breakdown
            Transaction.aggregate([
                { $match: txFilter },
                { $group: { _id: '$type', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            // 2. Recent Notifications
            Notification.find({ userId: req.user._id }).sort({ date: -1 }).limit(10).lean(),
            // 3. Unread Notifications Count
            Notification.countDocuments({ userId: req.user._id, isRead: false }),
            // 4. Buy Amount Pie Breakdown
            Transaction.aggregate([
                { $match: { ...pieMatch, type: 'buy', ...dateMatch } },
                { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            // 5. Sell Amount Pie Breakdown
            Transaction.aggregate([
                { $match: { ...pieMatch, type: 'sell', ...dateMatch } },
                { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
            ]),
            // 6. Monthly Leads Count
            ExtraMember.countDocuments({
                collectedBy: userId,
                collectedAt: { $gte: startOfMonth, $lte: endOfMonth }
            }),
            // 7. Total Lifetime Leads Count
            ExtraMember.countDocuments({ collectedBy: userId }),
            // 8. Annual Leads Count
            ExtraMember.countDocuments({
                collectedBy: userId,
                collectedAt: {
                    $gte: new Date(new Date().getFullYear(), 0, 1),
                    $lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
                }
            }),
            // 9. Manager's own member count
            isManager
                ? Promise.all([
                    ManagersMember.countDocuments({ addedBy: userId }),
                    ExtraMember.countDocuments({ collectedBy: userId, memberCode: { $ne: null, $ne: '' } })
                ]).then(([a, b]) => a + b)
                : Promise.resolve(0),
            // 10. Total Transactions Count
            isManager
                ? Transaction.countDocuments({ branchId })
                : Transaction.countDocuments({ fieldVisitorId: userId })
        ]);

        let buyAmount = 0;
        let sellAmount = 0;
        monthlyBreakdown.forEach(item => {
            if (item._id === 'buy') buyAmount = item.totalAmount;
            else if (item._id === 'sell') sellAmount = item.totalAmount;
        });

        let buyThisUser = 0;
        let buyOthers = 0;
        buyAmountBreakdown.forEach(item => {
            if (item._id?.toString() === userId.toString()) buyThisUser = item.totalAmount;
            else buyOthers += item.totalAmount;
        });

        let sellThisUser = 0;
        let sellOthers = 0;
        sellAmountBreakdown.forEach(item => {
            if (item._id?.toString() === userId.toString()) sellThisUser = item.totalAmount;
            else sellOthers += item.totalAmount;
        });

        // If manager, we also want the list of field visitors for the dashboard
        let fieldVisitors = [];
        if (isManager) {
            const fvs = await FieldVisitor.find({ branchId }).lean();
            const [fvAggregation, fvMemberCounts, fvExtraCounts] = await Promise.all([
                Transaction.aggregate([
                    { $match: { branchId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                    { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' }, transactionCount: { $sum: 1 } } }
                ]),
                Member.aggregate([
                    { $match: { branchId } },
                    { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } }
                ]),
                ExtraMember.aggregate([
                    {
                        $match: {
                            branchId,
                            $or: [{ memberCode: { $exists: false } }, { memberCode: null }, { memberCode: '' }]
                        }
                    },
                    { $group: { _id: '$collectedBy', count: { $sum: 1 } } }
                ])
            ]);

            const statsMap = new Map(fvAggregation.map(s => [s._id?.toString(), s]));
            const memberCountMap = new Map(fvMemberCounts.map(c => [c._id?.toString(), c.count]));
            const leadCountMap = new Map(fvExtraCounts.map(c => [c._id?.toString(), c.count]));

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
                    address: fv.postalAddress || fv.address || 'N/A',
                    amount: s.totalAmount,
                    totalAmount: s.totalAmount,
                    transactionCount: s.transactionCount,
                    memberCount: memberCountMap.get(fv._id.toString()) || 0,
                    leadCount: leadCountMap.get(fv._id.toString()) || 0
                };
            });
        }

        res.json({
            success: true,
            data: {
                buy: { amount: buyAmount },
                sell: { amount: sellAmount },
                walletBalance,
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
                extraMembersCount,
                recentExtraMembers,
                recentManagerMembers: isManager ? recentExtraMembers : [],
                totalTransactions: totalTransactionsCount,
                transactions,
                notifications,
                unreadNotificationsCount,
                fieldVisitors,
                monthlyLeads,
                totalLeads,
                managersMemberCount,
                annualLeads
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
