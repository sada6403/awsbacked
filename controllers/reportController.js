const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const Notification = require('../models/Notification');
const Note = require('../models/Note');
const ManagersMember = require('../models/ManagersMember');
const ExtraMember = require('../models/ExtraMember');
const mongoose = require('mongoose');

const BranchManager = require('../models/BranchManager');

const cacheService = require('../services/cacheService');

/**
 * Force clear the dashboard cache (e.g. after registration)
 */
const clearDashboardCache = () => {
    cacheService.delStartWith('manager_dash_');
    cacheService.delStartWith('fv_dash_');
    cacheService.delStartWith('stats_');
    console.log('[reportController] Dashboard caches cleared.');
};

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

        // Simplified branchMatch for better index performance
        const branchMatch = { branchId: { $in: [branchId, branchId.toUpperCase(), 'default-branch'] } };

        const cacheKey = `manager_dash_${req.user._id}_${branchId}`;
        const cachedData = cacheService.get(cacheKey);
        // Temporarily bypass cache to force a fresh pull for the fix
        if (cachedData && !req.query.refresh) {
            console.log(`[getManagerDashboard] Serving from Cache: ${cacheKey}`);
            return res.json(cachedData);
        }

        // Efficiently fetch all branch data in parallel
        const [
            transactionFacets,
            notificationData,
            manager,
            managersMemberCount
        ] = await Promise.all([
            // 1. Transaction Facets (Consolidated 2 aggregations into 1)
            Transaction.aggregate([
                { $facet: {
                    contributions: [
                        { $match: { ...branchMatch, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                        {
                            $group: {
                                _id: { fieldVisitorId: '$fieldVisitorId', type: '$type' },
                                totalAmount: { $sum: '$totalAmount' },
                                transactionCount: { $sum: 1 }
                            }
                        }
                    ],
                    monthlyData: [
                        { $match: { ...branchMatch, date: { $gte: startOfYear, $lte: endOfYear } } },
                        {
                            $group: {
                                _id: { month: { $month: '$date' }, type: '$type' },
                                totalAmount: { $sum: '$totalAmount' }
                            }
                        },
                        { $sort: { '_id.month': 1 } }
                    ]
                }}
            ]).then(res => res[0]),

            // 2. Notification Data
            Promise.all([
                Notification.find({ userId: req.user._id }).sort({ date: -1 }).limit(10).lean(),
                Notification.countDocuments({ userId: req.user._id, isRead: false })
            ]),

            // 3. Manager/Branch Info
            BranchManager.findById(req.user._id).lean(),

            // 4. Counts
            ManagersMember.countDocuments({ addedBy: req.user._id })
        ]);

        const { contributions, monthlyData } = transactionFacets;
        const [notifications, unreadNotificationsCount] = notificationData;

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

        // Get field visitors
        const fieldVisitors = await FieldVisitor.find(branchMatch).select('name userId phone branchId area status memberCount leadCount totalBuyAmount totalSellAmount walletBalance').lean();

        // Get live counts per FV from real collections
        const fvIds = fieldVisitors.map(fv => fv._id);
        const fvIdsString = fieldVisitors.map(fv => fv._id.toString());
        const fvUserIds = fieldVisitors.map(fv => fv.userId).filter(Boolean);
        const allFvIds = [...fvIds, ...fvIdsString, ...fvUserIds];

        const [memberFacets, leadFacets] = await Promise.all([
            Member.aggregate([
                { $match: { fieldVisitorId: { $in: allFvIds } } },
                { $group: { _id: { $toLower: { $toString: '$fieldVisitorId' } }, count: { $sum: 1 } } }
            ]),
            ExtraMember.aggregate([
                { $facet: {
                    converted: [
                        { $match: { collectedBy: { $in: allFvIds }, memberCode: { $exists: true, $ne: null, $ne: '' } } },
                        { $group: { _id: { $toLower: { $toString: '$collectedBy' } }, count: { $sum: 1 } } }
                    ],
                    pure: [
                        { $match: { collectedBy: { $in: allFvIds }, $or: [{ memberCode: { $exists: false } }, { memberCode: null }, { memberCode: '' }] } },
                        { $group: { _id: { $toLower: { $toString: '$collectedBy' } }, count: { $sum: 1 } } }
                    ]
                }}
            ]).then(res => res[0])
        ]);

        const memberCountAgg = memberFacets;
        const convertedLeadCountAgg = leadFacets.converted;
        const leadCountAgg = leadFacets.pure;
        const memberCountMap = new Map();
        memberCountAgg.forEach(s => memberCountMap.set(s._id?.toString(), (memberCountMap.get(s._id?.toString()) || 0) + s.count));
        convertedLeadCountAgg.forEach(s => memberCountMap.set(s._id?.toString(), (memberCountMap.get(s._id?.toString()) || 0) + s.count));
        const leadCountMap = new Map(leadCountAgg.map(s => [s._id?.toString(), s.count]));

        const fieldVisitorStats = fieldVisitors.map(fv => {
            const key = fv._id.toString();
            const contrib = contributionMap.get(key) || { totalAmount: 0, transactionCount: 0 };
            
            return {
                _id: fv._id,
                name: fv.name || fv.fullName,
                userId: fv.userId,
                phone: fv.phone,
                email: fv.email,
                address: fv.postalAddress || fv.permanentAddress || 'N/A',
                totalAmount: contrib.totalAmount,
                amount: contrib.totalAmount, // Dashboard uses both
                transactionCount: contrib.transactionCount,
                memberCount: memberCountMap.get(key) || 0,
                leadCount: leadCountMap.get(key) || 0,
                walletBalance: fv.walletBalance || 0
            };
        }).sort((a, b) => b.totalAmount - a.totalAmount);

        const walletBalance = manager?.walletBalance || 0;
        const totalBranchAmount = fieldVisitorStats.reduce((sum, fv) => sum + fv.totalAmount, 0);
        const totalTransactions = fieldVisitorStats.reduce((sum, fv) => sum + fv.transactionCount, 0);
        const totalMembers = fieldVisitorStats.reduce((sum, fv) => sum + fv.memberCount, 0);

        // Recent items (merged)
        const [recentMgrMembers, recentExtMembers] = await Promise.all([
            ManagersMember.find({ addedBy: req.user._id })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            ExtraMember.find({ collectedBy: req.user._id })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage -biometricData')
                .sort({ collectedAt: -1 })
                .limit(10)
                .lean()
        ]);

        const recentManagerMembers = [...recentMgrMembers, ...recentExtMembers]
            .sort((a, b) => new Date(b.createdAt || b.collectedAt || 0) - new Date(a.createdAt || a.collectedAt || 0))
            .slice(0, 10);

        // Prepare pie chart (branch distribution)
        const pie = {
            total: totalBranchAmount,
            slices: (fieldVisitorStats || []).map(fv => ({
                label: fv.name,
                value: fv.totalAmount,
                userId: fv.userId
            }))
        };

        // Prepare bar chart (monthly analysis)
        const barChart = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            buy: 0,
            sell: 0
        }));

        monthlyData.forEach(item => {
            const mIdx = item._id.month - 1;
            if (mIdx >= 0 && mIdx < 12) {
                if (item._id.type === 'buy') barChart[mIdx].buy = item.totalAmount;
                else if (item._id.type === 'sell') barChart[mIdx].sell = item.totalAmount;
            }
        });

        const responsePayload = {
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
        };

        cacheService.set(cacheKey, responsePayload);
        res.json(responsePayload);
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

        // Simplified branchMatch for better index performance
        const branchMatch = { branchId: { $in: [branchId, branchId.toUpperCase(), 'default-branch'] } };

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        let fieldVisitorId = req.user?._id;
        if (fieldVisitorId) fieldVisitorId = new mongoose.Types.ObjectId(fieldVisitorId);

        const cacheKey = `fv_dash_${fieldVisitorId}_${branchId}`;
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
            console.log(`[getFieldVisitorDashboard] Serving from Cache: ${cacheKey}`);
            return res.json(cachedData);
        }

        // 1. Fetch Field Visitor info for wallet balance
        const visitor = await FieldVisitor.findById(fieldVisitorId).lean();
        const walletBalance = visitor?.walletBalance || 0;

        // Get BUY and SELL totals for the visitor
        const transactionBreakdown = await Transaction.aggregate([
            { $match: { fieldVisitorId } },
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

        // Latest transactions for this field visitor (Lean fetch)
        const transactions = await Transaction.find({ fieldVisitorId })
            .select('billNumber type productName quantity totalAmount date memberId')
            .sort({ date: -1 })
            .limit(20)
            .populate('memberId', 'name mobile memberCode')
            .lean();

        // Notifications and notes (Standard fetch, skip expensive autofill logic in GET)
        const notifications = await Notification.find({ userId: fieldVisitorId })
            .sort({ date: -1 })
            .limit(10)
            .lean();

        // Efficiently fetch remaining dashboard data in parallel
        const [
            notes,
            buyAmountBreakdown,
            sellAmountBreakdown,
            totalMembers,
            unreadNotificationsCount,
            monthlyLeads,
            annualLeads
        ] = await Promise.all([
            Note.find({ fieldVisitorId }).sort({ createdAt: -1 }).limit(20).lean(),
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

        const fvTotalsFinal = { buy: buyTotal, sell: sellTotal };

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

        const branchPie = {
            total: (buyThisVisitor + buyOthers + sellThisVisitor + sellOthers),
            slices: [] // Simplified: frontend mostly uses buyPieChart/sellPieChart directly
        };

        // For debugging missing amounts
        if (fvTotalsFinal.buy === 0 && fvTotalsFinal.sell === 0) {
            console.log(`[DEBUG] No transactions found for FV ${fieldVisitorId} in branch ${branchId}`);
        }

        const responsePayload = {
            success: true,
            data: {
                branchId,
                totals: fvTotalsFinal,
                monthlyTotals: {
                    buyAmount: buyThisVisitor,
                    sellAmount: sellThisVisitor,
                    totalAmount: buyThisVisitor + sellThisVisitor
                },
                walletBalance,
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
        };

        cacheService.set(cacheKey, responsePayload);
        res.json(responsePayload);
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
        if (isManager) {
            const manager = await BranchManager.findById(userId).lean();
            walletBalance = manager?.walletBalance || 0;
        } else {
            const visitor = await FieldVisitor.findById(userId).lean();
            walletBalance = visitor?.walletBalance || 0;
        }

        // Sanitize branchId for robust matching (fallback to lowercase, then check UPPER if needed)
        const branchId = (req.user?.branchId || 'default-branch').toLowerCase();

        // 1. Transaction Filter (Monthly)
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Simplified branchMatch for better index performance
        const branchMatch = { branchId: { $in: [branchId, branchId.toUpperCase(), 'default-branch'] } };

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
        if (!isManager) {
            pieMatch.fieldVisitorId = userId;
        }

        // Date matching for strict current month filtering (matching memberController logic)
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // MongoDB $month is 1-indexed (Jan=1)

        // Use range matching instead of $expr to leverage compound indexes on 'date'
        const dateMatch = {
            date: { $gte: startOfMonth, $lte: endOfMonth }
        };

        const cacheKey = `stats_${userId}_${branchId}_${currentYear}_${currentMonth}`;
        const cachedData = cacheService.get(cacheKey);
        // Temporarily bypass cache to force a fresh pull for the fix
        if (cachedData && !req.query.refresh) {
            console.log(`[getDashboardStats] Serving from Cache: ${cacheKey}`);
            return res.json(cachedData);
        }

        console.log(`[getDashboardStats] User: ${userId} (${req.user?.role}) Branch: ${branchId} Month: ${currentMonth} (Cache Miss)`);

        // Efficiently fetch all required counts and data in parallel
        const [
            transactionFacets,
            leadFacets,
            managersMemberCount,
            totalMembersCount,
            notificationsData
        ] = await Promise.all([
            // 1. Transaction Facets (Consolidated 5 queries into 1)
            Transaction.aggregate([
                { $facet: {
                    monthlyBreakdown: [
                        { $match: txFilter },
                        { $group: { _id: '$type', totalAmount: { $sum: '$totalAmount' } } }
                    ],
                    buyAmountBreakdown: [
                        { $match: { ...pieMatch, type: 'buy', ...dateMatch } },
                        { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
                    ],
                    sellAmountBreakdown: [
                        { $match: { ...pieMatch, type: 'sell', ...dateMatch } },
                        { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' } } }
                    ],
                    totalCount: [
                        { $match: isManager ? branchMatch : { fieldVisitorId: userId } },
                        { $count: 'count' }
                    ],
                    recent: [
                        { $match: isManager ? branchMatch : { fieldVisitorId: userId } },
                        { $sort: { date: -1 } },
                        { $limit: 10 }
                    ]
                }}
            ]).then(res => res[0]),

            // 2. ExtraMember Facets (Consolidated 5 queries into 1)
            ExtraMember.aggregate([
                { $facet: {
                    monthlyLeads: [
                        { $match: { collectedBy: userId, collectedAt: { $gte: startOfMonth, $lte: endOfMonth } } },
                        { $count: 'count' }
                    ],
                    totalLeads: [
                        { $match: { collectedBy: userId } },
                        { $count: 'count' }
                    ],
                    annualLeads: [
                        { $match: { 
                            collectedBy: userId, 
                            collectedAt: { 
                                $gte: new Date(new Date().getFullYear(), 0, 1),
                                $lte: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59)
                            } 
                        }},
                        { $count: 'count' }
                    ],
                    recent: [
                        { $match: { collectedBy: userId, memberCode: { $ne: null, $ne: '' } } },
                        { $project: { profileImage: 0, signatureImage: 0, idFrontImage: 0, idBackImage: 0, biometricData: 0 } },
                        { $sort: { collectedAt: -1 } },
                        { $limit: 10 }
                    ]
                }}
            ]).then(res => res[0]),

            // 3. Manager's own combined member count
            Promise.all([
                ManagersMember.countDocuments({ addedBy: userId }),
                ExtraMember.countDocuments({ collectedBy: userId, memberCode: { $ne: null, $ne: '' } }),
                Member.countDocuments({ fieldVisitorId: userId })
            ]).then(([a, b, c]) => a + b + c),

            // 4. Total Members Count (Matches user expectations)
            isManager
                ? Promise.all([
                    Member.countDocuments(branchMatch),
                    ExtraMember.countDocuments({ ...branchMatch, memberCode: { $ne: null, $ne: '' } })
                ]).then(([a, b]) => a + b)
                : Member.countDocuments({ fieldVisitorId: userId }),

            // 5. Notifications
            Promise.all([
                Notification.find({ userId: req.user._id }).sort({ date: -1 }).limit(10).lean(),
                Notification.countDocuments({ userId: req.user._id, isRead: false })
            ])
        ]);

        const monthlyBreakdown = transactionFacets.monthlyBreakdown;
        const buyAmountBreakdown = transactionFacets.buyAmountBreakdown;
        const sellAmountBreakdown = transactionFacets.sellAmountBreakdown;
        const totalTransactionsCount = transactionFacets.totalCount[0]?.count || 0;
        const transactions = transactionFacets.recent;

        const monthlyLeads = leadFacets.monthlyLeads[0]?.count || 0;
        const totalLeads = leadFacets.totalLeads[0]?.count || 0;
        const annualLeads = leadFacets.annualLeads[0]?.count || 0;
        const recentExtraMembers = leadFacets.recent;

        const [notifications, unreadNotificationsCount] = notificationsData;


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
            const fvs = await FieldVisitor.find(branchMatch).lean();

            // Get all FV IDs so we can aggregate counts in parallel
            const fvIds = fvs.map(fv => fv._id);
            const fvIdsString = fvs.map(fv => fv._id.toString());
            const fvUserIds = fvs.map(fv => fv.userId).filter(Boolean);
            const allFvIds = [...fvIds, ...fvIdsString, ...fvUserIds];

            const [fvAggregation, memberCountAgg, convertedLeadCountAgg, leadCountAgg] = await Promise.all([
                // Transaction totals this month per FV
                Transaction.aggregate([
                    { $match: { ...branchMatch, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                    { $group: { _id: { $toLower: { $toString: '$fieldVisitorId' } }, totalAmount: { $sum: '$totalAmount' }, transactionCount: { $sum: 1 } } }
                ]),
                // Live member count: Member collection + converted ExtraMember (has memberCode)
                Member.aggregate([
                    { $match: { fieldVisitorId: { $in: allFvIds } } },
                    { $group: { _id: { $toLower: { $toString: '$fieldVisitorId' } }, count: { $sum: 1 } } }
                ]),
                // Converted leads (ExtraMember WITH memberCode = registered members)
                ExtraMember.aggregate([
                    { $match: { collectedBy: { $in: allFvIds }, memberCode: { $exists: true, $ne: null, $ne: '' } } },
                    { $group: { _id: { $toLower: { $toString: '$collectedBy' } }, count: { $sum: 1 } } }
                ]),
                // Pure leads (ExtraMember WITHOUT memberCode)
                ExtraMember.aggregate([
                    { $match: { collectedBy: { $in: allFvIds }, $or: [{ memberCode: { $exists: false } }, { memberCode: null }, { memberCode: '' }] } },
                    { $group: { _id: { $toLower: { $toString: '$collectedBy' } }, count: { $sum: 1 } } }
                ])
            ]);

            const statsMap = new Map(fvAggregation.map(s => [s._id?.toString(), s]));
            const memberCountMap = new Map();
            memberCountAgg.forEach(s => memberCountMap.set(s._id?.toString(), (memberCountMap.get(s._id?.toString()) || 0) + s.count));
            convertedLeadCountAgg.forEach(s => memberCountMap.set(s._id?.toString(), (memberCountMap.get(s._id?.toString()) || 0) + s.count));
            const leadCountMap = new Map(leadCountAgg.map(s => [s._id?.toString(), s.count]));

            fieldVisitors = fvs.map(fv => {
                const fvIdStr = fv._id.toString();
                const s = statsMap.get(fvIdStr) || { totalAmount: 0, transactionCount: 0 };
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
                    memberCount: memberCountMap.get(fvIdStr) || 0,
                    leadCount: leadCountMap.get(fvIdStr) || 0
                };
            });
        }

        const responsePayload = {
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
                totalMembers: (typeof totalMembersCount !== 'undefined') ? totalMembersCount : 0,
                extraMembersCount: (typeof totalLeads !== 'undefined') ? totalLeads : 0,
                recentExtraMembers: (typeof recentExtraMembers !== 'undefined') ? recentExtraMembers : [],
                recentManagerMembers: isManager ? ((typeof recentExtraMembers !== 'undefined') ? recentExtraMembers : []) : [],
                totalTransactions: (typeof totalTransactionsCount !== 'undefined') ? totalTransactionsCount : 0,
                transactions: (typeof transactions !== 'undefined') ? transactions : [],
                notifications: (typeof notifications !== 'undefined') ? notifications : [],
                unreadNotificationsCount: (typeof unreadNotificationsCount !== 'undefined') ? unreadNotificationsCount : 0,
                fieldVisitors: fieldVisitors || [],
                monthlyLeads: (typeof monthlyLeads !== 'undefined') ? monthlyLeads : 0,
                totalLeads: (typeof totalLeads !== 'undefined') ? totalLeads : 0,
                managersMemberCount: (typeof managersMemberCount !== 'undefined') ? managersMemberCount : 0,
                annualLeads: (typeof annualLeads !== 'undefined') ? annualLeads : 0
            }
        };

        cacheService.set(cacheKey, responsePayload);
        res.json(responsePayload);
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

module.exports = {
    getManagerDashboard,
    getFieldVisitorDashboard,
    getYearlyAnalysis,
    getDashboardStats,
    getMemberTransactions,
    clearDashboardCache
};
