const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const ExtraMember = require('../models/ExtraMember');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const ManagersMember = require('../models/ManagersMember');
const Notification = require('../models/Notification');
const Product = require('../models/Product');
const WalletTransaction = require('../models/WalletTransaction');
const { generateBillPDF } = require('../utils/pdfGenerator');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const Otp = require('../models/Otp');

// Generate Bill Number
const generateBillNumber = async (type) => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const prefix = `NF-${type[0]}-${dateStr}`;

    // Find the latest transaction with this prefix to get the highest sequence
    const lastTransaction = await Transaction.findOne({
        billNumber: new RegExp(`^${prefix}-\\d+$`)
    }).sort({ billNumber: -1 }).lean();

    let nextSequence = 1;
    if (lastTransaction && lastTransaction.billNumber) {
        const parts = lastTransaction.billNumber.split('-');
        const lastSeq = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
        }
    }

    const sequenceStr = nextSequence.toString().padStart(5, '0');
    return `${prefix}-${sequenceStr}`;
};

// @desc    Create new transaction
// @route   POST /api/transactions
// @access  Private
const createTransaction = async (req, res) => {
    try {
        const {
            transactionType, // BUY or SELL
            memberId,
            fieldVisitorId,
            productId,
            quantity,
            unitType,
            unitPrice
        } = req.body;

        const branchId = req.user?.branchId || 'default-branch';
        const normalizedType = (transactionType || '').toString().toLowerCase();
        if (!['buy', 'sell'].includes(normalizedType)) {
            return res.status(400).json({ success: false, message: 'transactionType must be BUY or SELL' });
        }

        // Validate memberId format to prevent CastError
        if (!mongoose.Types.ObjectId.isValid(memberId)) {
            return res.status(400).json({ success: false, message: 'Invalid Member ID format' });
        }

        // Consolidate member lookup: Check Member (central) first, then ExtraMember (FV), then ManagersMember (Manager)
        let member = await Member.findById(memberId);
        let isManagerMember = false;

        if (!member) {
            member = await ExtraMember.findById(memberId);
        }

        if (!member) {
            member = await ManagersMember.findById(memberId);
            if (member) {
                isManagerMember = true;
            }
        }

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found in any collection' });
        }

        // Branch check - assuming ExtraMember has branchId (I added it to models/ExtraMember.js earlier)
        if (member.branchId && member.branchId !== branchId) {
            return res.status(403).json({ success: false, message: 'Member not in your branch' });
        }

        let fv = null;
        if (fieldVisitorId) {
            fv = (mongoose.Types.ObjectId.isValid(fieldVisitorId))
                ? await FieldVisitor.findById(fieldVisitorId)
                : await FieldVisitor.findOne({ userId: fieldVisitorId });

            if (!fv) {
                console.error('[createTransaction] Field visitor not found:', fieldVisitorId);
                return res.status(404).json({ success: false, message: 'Field visitor not found' });
            }
            if (fv.branchId !== branchId) {
                console.error('[createTransaction] FV branch mismatch. Req branch:', branchId, 'FV branch:', fv.branchId);
                return res.status(403).json({ success: false, message: 'Field visitor not in your branch' });
            }
        } else {
            // Check if user is a Manager (or allow if logic dictates)
            // For now, we allow it, assuming the frontend only sends empty FV ID for allowed roles.
            console.log('[createTransaction] No Field Visitor ID provided. Proceeding as direct transaction.');
        }

        const product = await Product.findOne({ productId });
        const productName = product ? product.name : 'Unknown Product';

        const totalAmount = Number(quantity) * Number(unitPrice);
        if (isNaN(totalAmount)) {
            return res.status(400).json({ success: false, message: 'Invalid quantity or unit price' });
        }

        const maxRetries = 3;
        let attempt = 0;
        let saved = null;
        let billNumber = '';
        let transaction = null;

        while (attempt < maxRetries) {
            try {
                attempt++;
                billNumber = await generateBillNumber(normalizedType.toUpperCase());

                // Determine member model for polymorphic ref
                let memberModel = 'Member';
                if (isManagerMember) {
                    memberModel = 'ManagersMember';
                } else {
                    // Check if member is from ExtraMember
                    const isExtra = await ExtraMember.exists({ _id: member._id });
                    if (isExtra) memberModel = 'ExtraMember';
                }

                transaction = new Transaction({
                    billNumber,
                    type: normalizedType,
                    memberId: member._id,
                    memberModel,
                    fieldVisitorId: fv ? fv._id : null,
                    productName,
                    quantity: Number(quantity),
                    unitType,
                    unitPrice: Number(unitPrice),
                    totalAmount,
                    branchId,
                    date: new Date() // Explicitly set date to ensure it exists for PDF
                });

                // Prepare Officer Details for PDF (FV or Manager)
                let officer = fv;
                if (!officer && req.user && req.user.role === 'manager') {
                    // Check if we have the manager object loaded, if not fetch it
                    // We accessed req.user, but meaningful fields might be missing if auth middleware only sets basic info. 
                    // Usually auth middleware attaches full user. Let's assume req.user is sufficient or fetch if needed.
                    // Auth middleware usually attaches full document.
                    // But just to be safe and consistent with model fields:
                    const mgr = await BranchManager.findById(req.user._id);
                    if (mgr) {
                        officer = {
                            name: mgr.fullName,
                            userId: mgr.userId,
                            phone: mgr.phone,
                            area: mgr.branchName,
                            role: 'Manager'
                        };
                    }
                }

                // Generate PDF
                let pdfUrl = '';
                try {
                    pdfUrl = await generateBillPDF(transaction, member, officer || {});
                    transaction.pdfUrl = pdfUrl;
                } catch (pdfErr) {
                    console.error('[createTransaction] PDF Generation Error:', pdfErr.message);
                    // We fail here because PDF is critical, but we don't retry for PDF generation errors
                    throw new Error(`PDF Generation failed: ${pdfErr.message}`);
                }

                // --- Wallet Logic Integration ---
                // --- Wallet Logic Integration ---

                // 1. Field Visitor Transaction
                if (fv) {
                    if (normalizedType === 'buy') {
                        if ((fv.walletBalance || 0) < totalAmount) {
                            throw new Error('Insufficient wallet balance to perform this purchase');
                        }
                        fv.walletBalance = (fv.walletBalance || 0) - totalAmount;
                    } else if (normalizedType === 'sell') {
                        fv.walletBalance = (fv.walletBalance || 0) + totalAmount;
                    }

                    // Save FV wallet update
                    await fv.save();

                    // Create Wallet Transaction Entry
                    const walletTx = new WalletTransaction({
                        userId: fv._id,
                        userModel: 'FieldVisitor',
                        type: normalizedType === 'buy' ? 'buy' : 'sell',
                        amount: totalAmount,
                        balanceAfter: fv.walletBalance,
                        reference: `Member ${normalizedType === 'buy' ? 'Purchase' : 'Sale'}: ${billNumber}`,
                        relatedTransactionId: transaction._id // Use transaction._id as it's generated on instantiation
                    });
                    await walletTx.save();
                }
                // 2. Manager Direct Transaction (No FV)
                else if (req.user && req.user.role === 'manager') {
                    const mgr = await BranchManager.findById(req.user._id);
                    if (mgr) {
                        if (normalizedType === 'buy') {
                            // Manager Buying (Outflow)
                            if ((mgr.walletBalance || 0) < totalAmount) {
                                throw new Error('Insufficient wallet balance to perform this purchase');
                            }
                            mgr.walletBalance = (mgr.walletBalance || 0) - totalAmount;
                        } else if (normalizedType === 'sell') {
                            // Manager Selling (Inflow)
                            mgr.walletBalance = (mgr.walletBalance || 0) + totalAmount;
                        }

                        await mgr.save();

                        const walletTx = new WalletTransaction({
                            userId: mgr._id,
                            userModel: 'BranchManager',
                            type: normalizedType === 'buy' ? 'buy' : 'sell',
                            amount: totalAmount,
                            balanceAfter: mgr.walletBalance,
                            reference: `Direct ${normalizedType === 'buy' ? 'Purchase' : 'Sale'}: ${billNumber}`,
                            relatedTransactionId: transaction._id
                        });
                        await walletTx.save();
                    }
                }

                saved = await transaction.save();

                // Determine if this is a first transaction for a lead or manager-member
                const isFirstTransactionLead = (memberModel === 'ManagersMember' && !member.isFirstTransactionDone);

                if (isFirstTransactionLead) {
                    member.isFirstTransactionDone = true;
                    await member.save();
                }

                // If save is successful, break the loop
                break;
            } catch (err) {
                console.error('[createTransaction] Error caught during attempt', attempt, ':', err);
                console.error('[createTransaction] Error Code:', err.code, 'KeyPattern:', err.keyPattern);

                // Check for duplicate key error on billNumber
                // Use robust check handling both keyPattern and error message text
                const isDuplicate = err.code === 11000 || err.code === 11001 || (err.message && err.message.includes('E11000'));
                const isBillNumber = (err.keyPattern && err.keyPattern.billNumber) || (err.message && err.message.includes('billNumber'));

                if (isDuplicate && isBillNumber) {
                    console.warn(`[createTransaction] Bill number collision (Attempt ${attempt}/${maxRetries}): ${billNumber}. Retrying...`);
                    if (attempt === maxRetries) {
                        throw new Error('Failed to generate unique bill number after multiple attempts. Please try again.');
                    }
                    // Continue to next iteration to regenerate bill number
                    continue;
                } else {
                    // Start of non-retryable error
                    throw err;
                }
            }
        }

        // --- Notifications (SMS & Email) ---

        // 0. Manager Notification (User Request)
        if (req.user && req.user.role === 'manager') {
            try {
                const { createAndSendNotification } = require('../utils/notificationHelper');
                // Fire and forget
                createAndSendNotification({
                    title: `Transaction: ${normalizedType.toUpperCase()}`,
                    body: `You performed a ${normalizedType.toUpperCase()} transaction of ${totalAmount} for ${(member.name || member.fullName) || 'Member'}. Bill: ${billNumber}`,
                    userId: req.user._id,
                    userRole: 'manager',
                    branchId: branchId,
                    transactionId: saved._id,
                    managerId: req.user._id,
                    memberId: member._id,
                    date: new Date(),
                    attachment: saved.pdfUrl // Use saved.pdfUrl
                }).catch(e => console.error('[createTransaction] ASYNC_MGR_NOTIF_ERROR:', e.message));
                console.log('[createTransaction] Triggered manager notification (async).');
            } catch (notifErr) {
                console.error('[createTransaction] CRITICAL_BYPASS: Failed to setup manager notification:', notifErr.message);
            }
        }

        // 1. Send SMS Bill (Normal SMS)
        if (member.mobile) {
            console.log('[createTransaction] Triggering SMS (async)...');
            smsService.sendBillSMS(member.mobile, {
                name: member.full_name || member.name,
                type: normalizedType.toUpperCase(),
                billNumber: billNumber,
                date: new Date().toLocaleDateString(),
                amount: totalAmount,
                productName: productName,
                quantity: Number(quantity),
                unitType: unitType,
                unitPrice: Number(unitPrice)
            }).catch(e => console.error('[createTransaction] ASYNC_SMS_ERROR:', e.message));
        }

        // 2. Send Email Bill (PDF)
        if (member.email && member.email.trim().length > 0) {
            console.log(`[createTransaction] Triggering Email (async) for ${member.email}`);
            emailService.sendBillEmail(member.email, {
                name: member.full_name || member.name,
                type: normalizedType.toUpperCase(),
                billNumber: billNumber,
                date: new Date().toLocaleDateString(),
                amount: totalAmount
            }, saved.pdfUrl).catch(e => console.error('[createTransaction] ASYNC_EMAIL_ERROR:', e.message));
        }

        // Manual population for memberId since it can be from 3 different collections
        const populated = await Transaction.findById(saved._id)
            .populate('fieldVisitorId', 'name userId branchId managerId')
            .lean();

        // Add member details manually to the response
        populated.memberId = {
            _id: member._id,
            name: member.name || member.fullName,
            mobile: member.mobile,
            branchId: member.branchId,
            memberCode: member.memberCode,
            address: member.address
        };

        // Notify field visitor + branch manager
        try {
            console.log('[createTransaction] Preparing Notifications...');
            let managerNum = null;
            if (fv && fv.managerId) {
                // We await this as it's a DB query, but we could optimize if needed.
                managerNum = await BranchManager.findById(fv.managerId).lean();
            }

            const title = `${normalizedType === 'sell' ? '📤 Sale' : '🛒 Purchase'} - ${productName}`;
            const body = `Transaction of Rs. ${totalAmount} on ${new Date().toLocaleDateString()} for ${member.name || member.fullName || 'Member'}`;

            const notifications = [];

            if (fv) {
                notifications.push({
                    title,
                    body,
                    date: new Date(),
                    isRead: false,
                    attachment: saved.pdfUrl,
                    transactionId: saved._id,
                    fieldVisitorId: fv._id,
                    memberId: member._id,
                    branchId,
                    userId: fv._id,
                    userRole: 'field_visitor'
                });
            }

            if (managerNum) {
                notifications.push({
                    title,
                    body,
                    date: new Date(),
                    isRead: false,
                    attachment: saved.pdfUrl,
                    transactionId: saved._id,
                    managerId: managerNum._id,
                    memberId: member._id,
                    branchId,
                    userId: managerNum._id,
                    userRole: 'manager'
                });
            }

            const { sendManyAndPush } = require('../utils/notificationHelper');
            console.log(`[createTransaction] Triggering ${notifications.length} notifications (async)...`);
            // Fire and forget pushes
            sendManyAndPush(notifications).catch(e => console.error('[createTransaction] ASYNC_NOTIF_ERROR:', e.message));
        } catch (notifyErr) {
            console.error('[createTransaction] Notification Preparation failed:', notifyErr.message);
        }

        console.log('[createTransaction] Success! Returning response for bill:', saved.billNumber);
        res.status(201).json({
            success: true,
            data: populated
        });
    } catch (error) {
        console.error('[createTransaction] Major Error:', error);
        console.error('[createTransaction] Stack:', error.stack);
        console.error('[createTransaction] Body:', req.body);
        console.error('[createTransaction] User:', req.user);
        // Improved error handling for specific cases like insufficient balance
        const isInsufficientBalance = error.message && error.message.toLowerCase().includes('insufficient wallet balance');

        res.status(isInsufficientBalance ? 400 : 500).json({
            success: false,
            message: error.message || 'Failed to create transaction',
            v: 5,
            debug: {
                error: error.toString(),
                stack: error.stack
            }
        });
    }
};

// @desc    Get transactions
// @route   GET /api/transactions
// @access  Private
const getTransactions = async (req, res) => {
    try {
        const { memberId, type, fieldVisitorId, startDate, endDate } = req.query;
        const branchId = req.user?.branchId;
        const query = {};

        // If specific member or visitor is requested, we use that as primary filter.
        // We only enforce branchId if no specific target is provided, or as an additional check.
        if (memberId) {
            query.memberId = mongoose.Types.ObjectId.isValid(memberId)
                ? new mongoose.Types.ObjectId(memberId)
                : memberId;
        }

        if (fieldVisitorId) {
            query.fieldVisitorId = mongoose.Types.ObjectId.isValid(fieldVisitorId)
                ? new mongoose.Types.ObjectId(fieldVisitorId)
                : fieldVisitorId;
        }

        if (type) query.type = type.toString().toLowerCase();

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Security/Scope: If not a super-admin, filter by branch. 
        // But be lenient if query already has identifiers.
        if (branchId && !memberId && !fieldVisitorId) {
            query.branchId = branchId;
        }

        console.log('[getTransactions] Query:', JSON.stringify(query));
        const transactions = await Transaction.find(query)
            .sort({ date: -1 })
            .limit(100)
            .populate('fieldVisitorId', 'name userId branchId')
            .lean();

        // Manual Polymorphic Population for memberId
        const memberIdsByModel = {
            'Member': [],
            'ExtraMember': [],
            'ManagersMember': []
        };

        transactions.forEach(tx => {
            const model = tx.memberModel || 'Member';
            if (memberIdsByModel[model]) {
                memberIdsByModel[model].push(tx.memberId);
            }
        });

        const [members, extras, managerMembers] = await Promise.all([
            Member.find({ _id: { $in: memberIdsByModel['Member'] } }).select('name mobile branchId memberCode address').lean(),
            ExtraMember.find({ _id: { $in: memberIdsByModel['ExtraMember'] } }).select('name mobile branchId memberCode address').lean(),
            ManagersMember.find({ _id: { $in: memberIdsByModel['ManagersMember'] } }).select('name mobile branchId memberCode address').lean()
        ]);

        const memberMap = new Map();
        members.forEach(m => memberMap.set(m._id.toString(), m));
        extras.forEach(m => memberMap.set(m._id.toString(), m));
        managerMembers.forEach(m => memberMap.set(m._id.toString(), { ...m, name: m.name || m.fullName }));

        transactions.forEach(tx => {
            tx.memberId = memberMap.get(tx.memberId.toString()) || { _id: tx.memberId, name: 'Unknown' };
        });

        res.json({ success: true, count: transactions.length, data: transactions });
    } catch (error) {
        console.error('[getTransactions] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
    }
};

// @desc    Download bill and create notification
// @route   GET /api/transactions/:id/download-bill
// @access  Private
const downloadBill = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id;
        const userRole = req.user?.role;

        // Find transaction with populated data (Include address/phone/area for PDF)
        const transaction = await Transaction.findById(id)
            .populate('fieldVisitorId', 'name userId fullName phone area')
            .lean();

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Manual population for memberId
        const memberModel = transaction.memberModel || 'Member';
        let member = null;
        if (memberModel === 'Member') {
            member = await Member.findById(transaction.memberId).select('name mobile memberCode address').lean();
        } else if (memberModel === 'ExtraMember') {
            member = await ExtraMember.findById(transaction.memberId).select('name mobile memberCode address').lean();
        } else if (memberModel === 'ManagersMember') {
            member = await ManagersMember.findById(transaction.memberId).select('name mobile memberCode address').lean();
            if (member) member.name = member.name || member.fullName;
        }
        transaction.memberId = member || { _id: transaction.memberId, name: 'Unknown' };

        // Check if user has access to this transaction
        const branchId = req.user?.branchId || 'default-branch';
        if (transaction.branchId !== branchId) {
            return res.status(403).json({ success: false, message: 'Access denied to this transaction' });
        }

        // Prepare Officer Details for PDF (FV or Manager)
        let officer = transaction.fieldVisitorId;
        if (!officer) {
            // If no FV, it must be a Manager transaction. Find manager by branchId.
            const manager = await BranchManager.findOne({ branchId: transaction.branchId }).lean();
            if (manager) {
                officer = {
                    name: manager.fullName,
                    userId: manager.userId,
                    phone: manager.phone,
                    area: manager.branchName,
                    role: 'Manager'
                };
            }
        }

        // REGENERATE PDF: Ensure file exists and uses latest design
        try {
            await generateBillPDF(transaction, transaction.memberId || {}, officer || {});
        } catch (e) {
            console.error('PDF Regeneration failed:', e.message);
        }

        // Create notification for bill download
        const memberName = transaction.memberId?.name || 'Unknown';
        const fvName = transaction.fieldVisitorId?.name || transaction.fieldVisitorId?.fullName || 'Field Visitor';
        const transactionType = transaction.type === 'buy' ? '🛒 Purchase' : '📤 Sale';

        const notificationTitle = `📄 Bill Downloaded - ${transactionType}`;
        const notificationBody = `Bill #${transaction.billNumber} for ${memberName} (Rs. ${transaction.totalAmount}) was downloaded by ${req.user.name || 'user'}`;

        // Create notification for field visitor (if not the downloader)
        if (transaction.fieldVisitorId && transaction.fieldVisitorId._id.toString() !== userId.toString()) {
            await Notification.create({
                title: notificationTitle,
                body: notificationBody,
                date: new Date(),
                isRead: false,
                attachment: transaction.pdfUrl,
                transactionId: transaction._id,
                fieldVisitorId: transaction.fieldVisitorId._id,
                memberId: transaction.memberId?._id,
                branchId: transaction.branchId,
                userId: transaction.fieldVisitorId._id,
                userRole: 'field_visitor'
            });
        }

        // Create notification for branch manager
        const fv = await FieldVisitor.findById(transaction.fieldVisitorId);
        if (fv && fv.managerId) {
            const manager = await BranchManager.findById(fv.managerId);
            if (manager) {
                await Notification.create({
                    title: notificationTitle,
                    body: notificationBody,
                    date: new Date(),
                    isRead: false,
                    attachment: transaction.pdfUrl,
                    transactionId: transaction._id,
                    managerId: manager._id,
                    memberId: transaction.memberId?._id,
                    branchId: transaction.branchId,
                    userId: manager._id,
                    userRole: 'manager'
                });
            }
        }

        // Log the download action
        console.log(`[downloadBill] Bill ${transaction.billNumber} downloaded by ${req.user.name} (${userRole})`);

        // Return transaction with PDF URL
        res.json({
            success: true,
            message: 'Bill accessed successfully. Notification sent.',
            data: {
                billNumber: transaction.billNumber,
                pdfUrl: transaction.pdfUrl,
                transaction
            }
        });
    } catch (error) {
        console.error('[downloadBill] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to download bill', error: error.message });
    }
};

module.exports = { createTransaction, getTransactions, downloadBill };
