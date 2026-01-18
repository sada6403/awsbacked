const Member = require('../models/Member');
const Notification = require('../models/Notification');
const { generateMemberPDF } = require('../utils/pdfGenerator');

// @desc    Register a member
// @route   POST /api/members
// @access  Private/FieldVisitor
const registerMember = async (req, res, next) => {
    try {
        const { name, address, mobile, email, nic, memberCode, registrationData } = req.body;
        const branchId = req.user?.branchId || 'default-branch';

        // Validate required fields
        if (!name || !address || !mobile || !nic) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: name, address, mobile, nic'
            });
        }

        // Ensure memberCode is unique if provided
        if (memberCode) {
            const exists = await Member.findOne({ memberCode });
            if (exists) {
                return res.status(400).json({
                    success: false,
                    message: 'Member code already exists'
                });
            }
        }

        // Generate Custom Member ID
        let generatedMemberCode = memberCode;
        if (!generatedMemberCode) {
            // 1. Get Branch Code
            let branchCode = 'XX'; // Default

            // Try to find branch name from BranchManager
            // If user is manager, they have branchName. If FieldVisitor, need to fetch.
            let branchNameStr = '';

            if (req.user.role === 'manager') {
                branchNameStr = req.user.branchName;
            } else {
                // Field Visitor: find their manager's branch or simply use the branchId mapping if possible
                // Better: Fetch BranchManager for this branchId
                const BranchManager = require('../models/BranchManager');
                const branchManager = await BranchManager.findOne({ branchId });
                if (branchManager) {
                    branchNameStr = branchManager.branchName;
                }
            }

            // Map branch name to 2-letter code
            if (branchNameStr) {
                const nameUpper = branchNameStr.toUpperCase();
                if (nameUpper.includes('KALMUNAI')) branchCode = 'KA';
                else if (nameUpper.includes('TRINCO')) branchCode = 'TR';
                else if (nameUpper.includes('KONDAVIL')) branchCode = 'JK'; // Jaffna (Kondavil)
                else if (nameUpper.includes('SAVAGACHERI') || nameUpper.includes('CHAVAKACHCHERI')) branchCode = 'JS'; // Jaffna (Savagacheri)
                else branchCode = nameUpper.substring(0, 2);
            }

            // 2. Find last member code for this branch prefix
            const prefix = `FA${branchCode}`;
            const lastMember = await Member.findOne({
                memberCode: { $regex: `^${prefix}\\d+$` }
            })
                .sort({ memberCode: -1 })
                .collation({ locale: "en", numericOrdering: true });

            let sequence = 1;
            if (lastMember && lastMember.memberCode) {
                const lastSeqStr = lastMember.memberCode.replace(prefix, '');
                const lastSeq = parseInt(lastSeqStr, 10);
                if (!isNaN(lastSeq)) {
                    sequence = lastSeq + 1;
                }
            }

            generatedMemberCode = `${prefix}${sequence.toString().padStart(3, '0')}`;
        }

        // Create new member instance
        const newMember = new Member({
            name,
            address,
            mobile,
            email,
            nic,
            memberCode: generatedMemberCode,
            registrationData,
            fieldVisitorId: req.user ? req.user._id : undefined,
            branchId
        });

        // Await the save operation properly
        const savedMember = await newMember.save();

        // --- Generate PDF & Notification ---
        let pdfUrl = '';
        try {
            pdfUrl = await generateMemberPDF(savedMember);

            // Create Notification for the Field Visitor (or Manager who registered)
            const userId = req.user ? req.user._id : undefined;
            if (userId) {
                await Notification.create({
                    title: `Member Registered: ${savedMember.name}`,
                    body: 'Tap to view/download the registration summary.',
                    date: new Date(),
                    isRead: false,
                    attachment: pdfUrl,
                    memberId: savedMember._id,
                    branchId: branchId,
                    userId: userId,
                    userRole: req.user.role // 'field_visitor' or 'manager'
                });
            }
        } catch (pdfError) {
            console.error('Failed to generate Member PDF/Notification:', pdfError);
            // Non-blocking error
        }

        // Return the saved document immediately
        res.status(201).json({
            success: true,
            message: 'Member registered successfully',
            data: savedMember
        });
    } catch (error) {
        console.error('Member Registration Error:', error);

        // Duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Member with this code or data already exists'
            });
        }

        // Mongoose validation error
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        // General server error
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
};

// @desc    Get members - Only show members assigned to current Field Visitor with transactions
// @route   GET /api/members
// @access  Private
const getMembers = async (req, res) => {
    try {
        const { search, fieldVisitorId: queryFvId } = req.query;
        const branchId = req.user?.branchId || 'default-branch';
        const userId = req.user?._id;
        const role = req.user?.role;

        let matchStage = { branchId };

        if (role === 'manager') {
            if (queryFvId) {
                matchStage.fieldVisitorId = new (require('mongoose')).Types.ObjectId(queryFvId);
            }
            // Manager sees all members in branch, optionally filtered by FV
        } else {
            // Field Visitor sees only their own members
            matchStage.fieldVisitorId = new (require('mongoose')).Types.ObjectId(userId);
        }

        const fs = require('fs');
        const logMsg = `[getMembers] Time: ${new Date().toISOString()}, Role: ${role}, UserID: ${userId}, Branch: ${branchId}, MatchStage: ${JSON.stringify(matchStage)}\n`;
        fs.appendFileSync('debug_log.txt', logMsg);

        console.log(`[getMembers] Role: ${role}, Match:`, JSON.stringify(matchStage));

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Aggregation pipeline
        const pipeline = [
            { $match: matchStage },
            // Lookup transactions
            {
                $lookup: {
                    from: 'transactions',
                    localField: '_id',
                    foreignField: 'memberId',
                    as: 'transactions'
                }
            },
            // Add transaction counts and sums (preserves members without transactions)
            // FILTER ONLY CURRENT MONTH TRANSACTIONS
            {
                $addFields: {
                    transactionCount: { $size: '$transactions' },
                    buyTransactions: {
                        $filter: {
                            input: '$transactions',
                            as: 'tx',
                            cond: {
                                $and: [
                                    { $eq: ['$$tx.type', 'buy'] },
                                    { $eq: [{ $year: '$$tx.date' }, { $year: now }] },
                                    { $eq: [{ $month: '$$tx.date' }, { $month: now }] }
                                ]
                            }
                        }
                    },
                    sellTransactions: {
                        $filter: {
                            input: '$transactions',
                            as: 'tx',
                            cond: {
                                $and: [
                                    { $eq: ['$$tx.type', 'sell'] },
                                    { $eq: [{ $year: '$$tx.date' }, { $year: now }] },
                                    { $eq: [{ $month: '$$tx.date' }, { $month: now }] }
                                ]
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    totalBuyAmount: { $ifNull: [{ $sum: '$buyTransactions.totalAmount' }, 0] },
                    totalSellAmount: { $ifNull: [{ $sum: '$sellTransactions.totalAmount' }, 0] },
                    totalBuyQuantity: { $ifNull: [{ $sum: '$buyTransactions.quantity' }, 0] },
                    totalSellQuantity: { $ifNull: [{ $sum: '$sellTransactions.quantity' }, 0] }
                }
            },
            // Apply search filter if provided
            ...(search ? [{
                $match: {
                    $or: [
                        { name: { $regex: search, $options: 'i' } },
                        { mobile: { $regex: search, $options: 'i' } },
                        { memberCode: { $regex: search, $options: 'i' } },
                        { address: { $regex: search, $options: 'i' } }
                    ]
                }
            }] : []),
            // Sort by registration date descending
            { $sort: { registeredAt: -1 } },
            // Limit to 50 for performance
            { $limit: 50 },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    mobile: 1,
                    address: 1,
                    nic: 1,
                    memberCode: 1,
                    fieldVisitorId: 1,
                    area: 1,
                    transactionCount: 1,
                    buyTransactionCount: { $size: '$buyTransactions' },
                    sellTransactionCount: { $size: '$sellTransactions' },
                    totalBuyAmount: 1,
                    totalSellAmount: 1,
                    totalBuyQuantity: 1,
                    totalSellQuantity: 1,
                    registeredAt: 1
                }
            }
        ];

        const members = await Member.aggregate(pipeline);
        console.log(`[getMembers] Found ${members.length} members with transactions`);

        // Format for mobile app with multiple field name options for compatibility
        const data = members.map(m => ({
            id: m._id?.toString() || m.id,
            _id: m._id,
            name: m.name,
            full_name: m.name, // Alias for Flutter compatibility
            mobile: m.mobile,
            address: m.address,
            postal_address: m.address, // Alias for Flutter compatibility
            nic: m.nic,
            member_code: m.memberCode,
            memberCode: m.memberCode, // Alternative field name
            area: m.area,
            transactionCount: m.transactionCount,
            totalBuyAmount: m.totalBuyAmount || 0,
            totalSellAmount: m.totalSellAmount || 0,
            totalBuyQuantity: m.totalBuyQuantity || 0,
            totalSellQuantity: m.totalSellQuantity || 0,
            registeredAt: m.registeredAt
        }));

        console.log(`[getMembers] Returning ${data.length} formatted members`);
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('[getMembers] Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve members',
            error: error.message
        });
    }
};

module.exports = { registerMember, getMembers };
