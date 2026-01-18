const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const Notification = require('../models/Notification');
const Product = require('../models/Product');
const { generateBillPDF } = require('../utils/pdfGenerator');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');

// Generate Bill Number
const generateBillNumber = async (type) => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const prefix = `NF-${type[0]}-${dateStr}`;

    // Find the latest transaction with this prefix to get the highest sequence
    const lastTransaction = await Transaction.findOne({
        billNumber: new RegExp(`^${prefix}-`)
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

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }
        if (member.branchId !== branchId) {
            return res.status(403).json({ success: false, message: 'Member not in your branch' });
        }

        const fv = (mongoose.Types.ObjectId.isValid(fieldVisitorId))
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

                transaction = new Transaction({
                    billNumber,
                    type: normalizedType,
                    memberId: member._id,
                    fieldVisitorId: fv._id,
                    productName,
                    quantity: Number(quantity),
                    unitType,
                    unitPrice: Number(unitPrice),
                    totalAmount,
                    branchId,
                    date: new Date() // Explicitly set date to ensure it exists for PDF
                });

                // Generate PDF
                let pdfUrl = '';
                try {
                    pdfUrl = await generateBillPDF(transaction, member, fv);
                    transaction.pdfUrl = pdfUrl;
                } catch (pdfErr) {
                    console.error('[createTransaction] PDF Generation Error:', pdfErr.message);
                    // We fail here because PDF is critical, but we don't retry for PDF generation errors
                    throw new Error(`PDF Generation failed: ${pdfErr.message}`);
                }

                saved = await transaction.save();
                // If save is successful, break the loop
                break;
            } catch (err) {
                if (err.code === 11000 && err.keyPattern && err.keyPattern.billNumber) {
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
        // 1. Send SMS Bill (Normal SMS)
        try {
            if (member.mobile) {
                await smsService.sendBillSMS(member.mobile, {
                    name: member.full_name || member.name,
                    type: normalizedType.toUpperCase(),
                    billNumber: billNumber,
                    date: new Date().toLocaleDateString(),
                    amount: totalAmount,
                    // New fields for better formatting
                    productName: productName,
                    quantity: Number(quantity),
                    unitType: unitType,
                    unitPrice: Number(unitPrice)
                });
            }
        } catch (smsError) {
            console.error('Failed to send Transaction SMS:', smsError);
        }

        // 2. Send Email Bill (PDF)
        try {
            if (member.email) {
                await emailService.sendBillEmail(member.email, {
                    name: member.full_name || member.name,
                    type: normalizedType.toUpperCase(),
                    billNumber: billNumber,
                    date: new Date().toLocaleDateString(),
                    amount: totalAmount
                }, pdfUrl);
            }
        } catch (emailError) {
            console.error('Failed to send Transaction Email:', emailError);
        }

        const populated = await Transaction.findById(saved._id)
            .populate('memberId', 'name mobile branchId')
            .populate('fieldVisitorId', 'name userId branchId managerId')
            .lean();

        // Notify field visitor + branch manager
        try {
            const manager = fv.managerId ? await BranchManager.findById(fv.managerId).lean() : null;
            const title = `${normalizedType === 'sell' ? '📤 Sale' : '🛒 Purchase'} - ${productName}`;
            const body = `Transaction of Rs. ${totalAmount} on ${new Date().toLocaleDateString()} for ${member.name}`;

            const notifications = [
                {
                    title,
                    body,
                    date: new Date(),
                    isRead: false,
                    attachment: pdfUrl,
                    transactionId: saved._id,
                    fieldVisitorId: fv._id,
                    memberId: member._id,
                    branchId,
                    userId: fv._id,
                    userRole: 'field_visitor'
                }
            ];

            if (manager) {
                notifications.push({
                    title,
                    body,
                    date: new Date(),
                    isRead: false,
                    attachment: pdfUrl,
                    transactionId: saved._id,
                    managerId: manager._id,
                    memberId: member._id,
                    branchId,
                    userId: manager._id,
                    userRole: 'branch_manager'
                });
            }

            await Notification.insertMany(notifications);
        } catch (notifyErr) {
            console.error('[createTransaction] Notification Error:', notifyErr.message);
            // Don't fail the whole transaction if notification fails
        }

        res.status(201).json({
            success: true,
            data: populated
        });
    } catch (error) {
        console.error('[createTransaction] Major Error:', error);
        console.error('[createTransaction] Stack:', error.stack);
        console.error('[createTransaction] Body:', req.body);
        console.error('[createTransaction] User:', req.user);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create transaction',
            v: 2,
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
        const branchId = req.user?.branchId || 'default-branch';
        const query = { branchId };

        if (memberId) query.memberId = memberId;
        if (fieldVisitorId) query.fieldVisitorId = fieldVisitorId;
        if (type) query.type = type.toString().toLowerCase();

        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        console.log('[getTransactions] branchId filter:', branchId);
        const transactions = await Transaction.find(query)
            .sort({ date: -1 })
            .populate('memberId', 'name mobile branchId')
            .populate('fieldVisitorId', 'name userId branchId');

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
            .populate('memberId', 'name mobile memberCode address')
            .populate('fieldVisitorId', 'name userId fullName phone area')
            .lean();

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Check if user has access to this transaction
        const branchId = req.user?.branchId || 'default-branch';
        if (transaction.branchId !== branchId) {
            return res.status(403).json({ success: false, message: 'Access denied to this transaction' });
        }

        // REGENERATE PDF: Ensure file exists and uses latest design
        try {
            await generateBillPDF(transaction, transaction.memberId || {}, transaction.fieldVisitorId || {});
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
                    userRole: 'branch_manager'
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
