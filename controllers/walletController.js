const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const Member = require('../models/Member');
const WalletTransaction = require('../models/WalletTransaction');
const WalletRequest = require('../models/WalletRequest');
const CashDonor = require('../models/CashDonor');
const Otp = require('../models/Otp');
const smsService = require('../services/smsService');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const CompanyTransfer = require('../models/CompanyTransfer');

// @desc    Get current user's wallet balance
// @route   GET /api/wallet/balance
// @access  Private
exports.getWalletBalance = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role;

        let user;
        if (role === 'manager') {
            user = await BranchManager.findById(userId).select('walletBalance');
        } else if (role === 'field_visitor') {
            user = await FieldVisitor.findById(userId).select('walletBalance');
        }

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, balance: user.walletBalance || 0 });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add cash to Manager's wallet (Input)
// @route   POST /api/wallet/input
// @access  Private (Manager only)
exports.inputCash = async (req, res) => {
    try {
        const { amount, reference } = req.body;
        const userId = req.user._id;

        if (req.user.role !== 'manager') {
            return res.status(403).json({ success: false, message: 'Only managers can input cash' });
        }

        const manager = await BranchManager.findById(userId);
        manager.walletBalance = (manager.walletBalance || 0) + Number(amount);
        await manager.save();

        const walletTx = new WalletTransaction({
            userId,
            userModel: 'BranchManager',
            type: 'input',
            amount: Number(amount),
            balanceAfter: manager.walletBalance,
            reference: reference || 'Cash Input'
        });
        await walletTx.save();

        // Send SMS notification
        try {
            if (manager.phone) {
                const message = `Nature Farming: Cash of Rs. ${amount} successfully input to your wallet. New Balance: Rs. ${manager.walletBalance}. Ref: ${reference || 'N/A'}`;
                await smsService.sendGeneralSMS(manager.phone, message);
            }
        } catch (smsErr) {
            console.error('Wallet SMS Error:', smsErr.message);
        }

        // Create Notification for Manager
        const { createAndSendNotification } = require('../utils/notificationHelper');
        await createAndSendNotification({
            title: 'Cash Input',
            body: `You added Rs. ${amount} to your wallet. Ref: ${reference || 'N/A'}`,
            date: new Date(),
            userId: userId, // Manager
            userRole: 'manager',
            managerId: userId,
            branchId: manager.branchId
        });

        res.json({ success: true, balance: manager.walletBalance, transaction: walletTx });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Transfer cash from Manager to Field Visitor
// @route   POST /api/wallet/transfer
// @access  Private (Manager only)
exports.transferCash = async (req, res) => {
    const useTransactions = process.env.USE_TRANSACTIONS !== 'false';
    let session = null;

    try {
        if (useTransactions) {
            session = await mongoose.startSession();
            session.startTransaction();
        }

        const queryOptions = session ? { session } : {};
        const { fvId, amount, reference } = req.body;
        const managerId = req.user._id;

        if (req.user.role !== 'manager') {
            throw new Error('Only managers can transfer cash');
        }

        const manager = await BranchManager.findById(managerId).session(session);
        if (manager.walletBalance < amount) {
            throw new Error('Insufficient wallet balance');
        }

        const fv = await FieldVisitor.findById(fvId).session(session);
        if (!fv) {
            throw new Error('Field Visitor not found');
        }

        manager.walletBalance -= Number(amount);
        fv.walletBalance = (fv.walletBalance || 0) + Number(amount);

        await manager.save(queryOptions);
        await fv.save(queryOptions);

        const txOut = new WalletTransaction({
            userId: managerId,
            userModel: 'BranchManager',
            type: 'transfer_out',
            amount: Number(amount),
            balanceAfter: manager.walletBalance,
            reference: reference || `Transfer to ${fv.name}`,
            relatedUserId: fv._id,
            relatedUserModel: 'FieldVisitor'
        });

        const txIn = new WalletTransaction({
            userId: fv._id,
            userModel: 'FieldVisitor',
            type: 'transfer_in',
            amount: Number(amount),
            balanceAfter: fv.walletBalance,
            reference: reference || `Transfer from ${manager.fullName}`,
            relatedUserId: managerId,
            relatedUserModel: 'BranchManager'
        });

        await txOut.save(queryOptions);
        await txIn.save(queryOptions);

        if (useTransactions && session) {
            await session.commitTransaction();
        }

        // Optional: Notify FV via SMS if they have a phone
        try {
            if (fv.phone) {
                const message = `Nature Farming: You received Rs. ${amount} from Manager. New Balance: Rs. ${fv.walletBalance}.`;
                await smsService.sendGeneralSMS(fv.phone, message);
            }

            // Create Notification for Field Visitor
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'Cash Received',
                body: `You received Rs. ${amount} from Manager.`,
                date: new Date(),
                userId: fv._id,
                userRole: 'field_visitor',
                fieldVisitorId: fv._id,
                branchId: fv.branchId
            });
        } catch (smsErr) {
            console.error('Wallet Transfer SMS Error:', smsErr.message);
        }

        res.json({ success: true, managerBalance: manager.walletBalance });
    } catch (error) {
        if (useTransactions && session) {
            await session.abortTransaction();
        }
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// @desc    Get wallet transaction history
// @route   GET /api/wallet/history
// @access  Private
exports.getWalletHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const history = await WalletTransaction.find({ userId })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json({ success: true, history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Request cash from Manager (FV)
// @route   POST /api/wallet/request
// @access  Private (Field Visitor only)
exports.requestCash = async (req, res) => {
    try {
        const { amount, requestedDate, fvNote, memberId } = req.body;
        const fvId = req.user._id;

        if (req.user.role !== 'field_visitor' && req.user.role !== 'field') {
            return res.status(403).json({ success: false, message: 'Only Field Visitors can request cash' });
        }

        const fv = await FieldVisitor.findById(fvId);
        const request = new WalletRequest({
            fvId,
            managerId: fv.managerId,
            amount: Number(amount),
            requestedDate: new Date(requestedDate),
            fvNote,
            memberId
        });

        await request.save();

        // [NEW] Fire Push Notification to Branch Manager
        try {
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'New Cash Request',
                body: `${fv.name} (FV) requested Rs. ${amount} for their wallet.`,
                date: new Date(),
                userId: fv.managerId,
                userRole: 'manager',
                managerId: fv.managerId,
                branchId: fv.branchId
            });
        } catch (notifErr) {
            console.error('Wallet Request Notification Error:', notifErr.message);
        }

        res.status(201).json({ success: true, request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get wallet requests
// @route   GET /api/wallet/requests
// @access  Private
exports.getWalletRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role;

        let query = {};
        if (role === 'manager') {
            query = { managerId: userId };
        } else {
            query = { fvId: userId };
        }

        const requests = await WalletRequest.find(query)
            .populate('fvId', 'name')
            .populate('memberId', 'name memberCode')
            .sort({ createdAt: -1 });

        res.json({ success: true, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Approve wallet request (Manager)
// @route   POST /api/wallet/requests/:id/approve
// @access  Private (Manager only)
exports.approveWalletRequest = async (req, res) => {
    // Check if we can use transactions (replica set) or not (standalone)
    const useTransactions = process.env.USE_TRANSACTIONS !== 'false';
    let session = null;

    try {
        if (useTransactions) {
            session = await mongoose.startSession();
            session.startTransaction();
        }

        const { managerNote } = req.body;
        const managerId = req.user._id;

        const queryOptions = session ? { session } : {};

        const request = await WalletRequest.findById(req.params.id).session(session);
        if (!request) throw new Error('Request not found');
        if (request.status !== 'pending') throw new Error('Request already processed');

        const manager = await BranchManager.findById(managerId).session(session);
        if (manager.walletBalance < request.amount) throw new Error('Insufficient wallet balance');

        const fv = await FieldVisitor.findById(request.fvId).session(session);

        // Deduct from Manager, Add to FV
        manager.walletBalance -= Number(request.amount);
        fv.walletBalance = (fv.walletBalance || 0) + Number(request.amount);

        request.status = 'approved';
        request.managerNote = managerNote;
        request.isProcessed = true;

        await manager.save(queryOptions);
        await fv.save(queryOptions);
        await request.save(queryOptions);

        // Record transactions
        const txOut = new WalletTransaction({
            userId: managerId,
            userModel: 'BranchManager',
            type: 'transfer_out',
            amount: request.amount,
            balanceAfter: manager.walletBalance,
            reference: `Approved Request: ${request.fvNote || 'N/A'}`,
            relatedUserId: fv._id,
            relatedUserModel: 'FieldVisitor'
        });

        const txIn = new WalletTransaction({
            userId: fv._id,
            userModel: 'FieldVisitor',
            type: 'transfer_in',
            amount: request.amount,
            balanceAfter: fv.walletBalance,
            reference: `Request Approved by Manager`,
            relatedUserId: managerId,
            relatedUserModel: 'BranchManager'
        });

        await txOut.save(queryOptions);
        await txIn.save(queryOptions);

        if (useTransactions && session) {
            await session.commitTransaction();
        }

        // Notify FV
        try {
            if (fv.phone) {
            }

            // Create Notification for Field Visitor
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'Cash Request Approved',
                body: `Your request for Rs. ${request.amount} has been approved by Manager.`,
                date: new Date(),
                userId: fv._id,
                userRole: 'field_visitor',
                fieldVisitorId: fv._id,
                branchId: fv.branchId
            });
        } catch (smsErr) {
            console.error('Approval SMS Error:', smsErr.message);
        }

        res.json({ success: true, message: 'Request approved and cash transferred' });
    } catch (error) {
        if (useTransactions && session) {
            await session.abortTransaction();
        }
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// @desc    Reject wallet request (Manager)
// @route   POST /api/wallet/requests/:id/reject
// @access  Private (Manager only)
exports.rejectWalletRequest = async (req, res) => {
    try {
        const { managerNote } = req.body;
        const request = await WalletRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        request.status = 'rejected';
        request.managerNote = managerNote;
        request.isProcessed = true;
        await request.save();

        res.json({ success: true, message: 'Request rejected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Send OTP to Donor (Manager)
// @route   POST /api/wallet/donor/send-otp
// @access  Private (Manager only)
exports.sendDonorOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await Otp.findOneAndUpdate(
            { identifier: phone },
            { otp, expires },
            { upsert: true, new: true }
        );

        await smsService.sendOTP(phone, otp);
        res.json({ success: true, message: 'OTP sent to donor' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify OTP and Add Cash (Manager)
// @route   POST /api/wallet/donor/verify-and-add
// @access  Private (Manager only)
exports.verifyDonorOTPAndAddCash = async (req, res) => {
    try {
        const { phone, otp, amount, name, idNumber, role } = req.body;
        const managerId = req.user._id;

        const otpDoc = await Otp.findOne({ identifier: phone, otp });
        if (!otpDoc || otpDoc.expires < new Date()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Check if this is a Field Visitor (Phone + ID/NIC match)
        // Ensure to check within the same branch as the manager (optional but safer)
        const manager = await BranchManager.findById(managerId);

        let fv = null;
        if (idNumber) {
            fv = await FieldVisitor.findOne({
                phone,
                nic: idNumber,
                branchId: manager.branchId
            });
        }

        if (fv) {
            // CASE 1: Field Visitor Cash Collection
            // Check Balance
            if ((fv.walletBalance || 0) < Number(amount)) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient balance in Field Visitor's wallet. Available: Rs. ${fv.walletBalance}`
                });
            }

            // Perform Transfer logic
            // 1. Deduct from FV
            fv.walletBalance = (fv.walletBalance || 0) - Number(amount);
            await fv.save();

            // 2. Add to Manager
            manager.walletBalance = (manager.walletBalance || 0) + Number(amount);
            await manager.save();

            // 3. Record Transactions
            // TX for FV (Outgoing)
            const txFV = new WalletTransaction({
                userId: fv._id,
                userModel: 'FieldVisitor',
                type: 'transfer_out',
                amount: Number(amount),
                balanceAfter: fv.walletBalance,
                reference: `Cash Collection by Manager (${manager.fullName})`,
                relatedUserId: managerId,
                relatedUserModel: 'BranchManager'
            });
            await txFV.save();

            // TX for Manager (Incoming)
            const txMgr = new WalletTransaction({
                userId: managerId,
                userModel: 'BranchManager',
                type: 'transfer_in', // Or 'input' but 'transfer_in' is more accurate for internal movement
                amount: Number(amount),
                balanceAfter: manager.walletBalance,
                reference: `Cash Collection from ${fv.name} (FV)`,
                relatedUserId: fv._id,
                relatedUserModel: 'FieldVisitor'
            });
            await txMgr.save();

            // Clear OTP
            await Otp.deleteOne({ _id: otpDoc._id });

            // Notify FV
            try {
                const msg = `Nature Farming: Manager collected Rs. ${amount} from your wallet. New Balance: Rs. ${fv.walletBalance}.`;
                await smsService.sendGeneralSMS(fv.phone, msg);
            } catch (e) {
                console.error('SMS Error:', e.message);
            }

            // Notify Field Visitor
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'Cash Deducted',
                body: `Manager collected Rs. ${amount} from your wallet.`,
                date: new Date(),
                userId: fv._id,
                userRole: 'field_visitor',
                fieldVisitorId: fv._id,
                branchId: fv.branchId
            });

            // Notify Manager
            await createAndSendNotification({
                title: 'Cash Collection',
                body: `Collected Rs. ${amount} from ${fv.name}.`,
                date: new Date(),
                userId: managerId,
                userRole: 'manager',
                managerId: managerId,
                branchId: manager.branchId
            });

            return res.json({
                success: true,
                balance: manager.walletBalance,
                message: `Successfully collected Rs. ${amount} from ${fv.name}`
            });

        } else {
            // CASE 2: External Donor (Standard Flow)
            let donor = await CashDonor.findOne({ phone });
            if (!donor) {
                donor = new CashDonor({ name, phone, idNumber, role });
                await donor.save();
            }

            manager.walletBalance = (manager.walletBalance || 0) + Number(amount);
            await manager.save();

            const walletTx = new WalletTransaction({
                userId: managerId,
                userModel: 'BranchManager',
                type: 'input',
                amount: Number(amount),
                balanceAfter: manager.walletBalance,
                reference: `Cash from Donor: ${donor.name} (${donor.role})`
            });
            await walletTx.save();

            // Notify Manager
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'Cash Received (Donor)',
                body: `Received Rs. ${amount} from ${donor.name} (${donor.role}).`,
                date: new Date(),
                userId: managerId,
                userRole: 'manager',
                managerId: managerId,
                branchId: manager.branchId
            });

            await Otp.deleteOne({ _id: otpDoc._id });

            res.json({ success: true, balance: manager.walletBalance, donor });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Transfer cash to company (FV or Manager)
// @route   POST /api/wallet/transfer-to-company
// @access  Private
exports.transferToCompany = async (req, res) => {
    // Check if we can use transactions
    const useTransactions = process.env.USE_TRANSACTIONS !== 'false';
    let session = null;

    try {
        if (useTransactions) {
            session = await mongoose.startSession();
            session.startTransaction();
        }

        const queryOptions = session ? { session } : {};

        const userId = req.user._id;
        const role = req.user.role;
        const { amount, depositorName, depositorNic, receiptImage } = req.body;

        const transferAmount = Number(amount);

        if (!transferAmount || transferAmount <= 0) throw new Error('Invalid amount');
        if (!depositorName) throw new Error('Depositor Name is required');
        if (!depositorNic) throw new Error('Depositor NIC is required');
        if (!receiptImage) throw new Error('Receipt image (Base64) is required');

        const receiptUrl = receiptImage; // Store base64 directly as per project pattern

        let userModelName;

        if (role === 'manager') {
            userModelName = 'BranchManager';
        } else if (role === 'field_visitor' || role === 'field') {
            userModelName = 'FieldVisitor';
        } else {
            throw new Error('Invalid user role for company transfer');
        }

        // Record pending transfer to company
        const companyTransfer = new CompanyTransfer({
            userId,
            userModel: userModelName,
            userRole: role,
            amount: transferAmount,
            depositorName,
            depositorNic,
            receiptUrl,
            status: 'pending'
        });
        await companyTransfer.save(queryOptions);

        if (useTransactions && session) {
            await session.commitTransaction();
        }

        res.status(201).json({
            success: true,
            message: 'Transfer to company requested successfully. Waiting for approval.',
            data: companyTransfer
        });

    } catch (error) {
        if (useTransactions && session) {
            await session.abortTransaction();
        }
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// @desc    Approve company transfer (Used by internal admin app)
// @route   PATCH /api/wallet/transfer-to-company/:id/approve
// @access  Private (Admin Role expected)
exports.approveCompanyTransfer = async (req, res) => {
    const useTransactions = process.env.USE_TRANSACTIONS !== 'false';
    let session = null;

    try {
        if (useTransactions) {
            session = await mongoose.startSession();
            session.startTransaction();
        }

        const queryOptions = session ? { session } : {};
        const { id } = req.params;

        const transfer = await CompanyTransfer.findById(id).session(session);
        if (!transfer) throw new Error('Transfer request not found');
        if (transfer.status !== 'pending') throw new Error('Transfer is not pending');

        let user;
        if (transfer.userModel === 'BranchManager') {
            user = await BranchManager.findById(transfer.userId).session(session);
        } else {
            user = await FieldVisitor.findById(transfer.userId).session(session);
        }

        if (!user) throw new Error('User associated with transfer not found');
        if ((user.walletBalance || 0) < transfer.amount) {
            throw new Error('Insufficient wallet balance for this approved transfer');
        }

        // Deduct balance
        user.walletBalance -= Number(transfer.amount);
        await user.save(queryOptions);

        // Update transfer status
        transfer.status = 'accepted';
        await transfer.save(queryOptions);

        // Record wallet transaction
        const txOut = new WalletTransaction({
            userId: user._id,
            userModel: transfer.userModel,
            type: 'transfer_out',
            amount: Number(transfer.amount),
            balanceAfter: user.walletBalance,
            reference: `Company Transfer Accepted: ${transfer.depositorName} (${transfer.depositorNic})`
        });
        await txOut.save(queryOptions);

        if (useTransactions && session) {
            await session.commitTransaction();
        }

        // Create notification for the user
        try {
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: 'Transfer to Company Accepted',
                body: `Your transfer request of Rs. ${transfer.amount} has been accepted and deducted from your wallet.`,
                date: new Date(),
                userId: user._id,
                userRole: transfer.userRole,
                managerId: transfer.userModel === 'BranchManager' ? user._id : undefined,
                fieldVisitorId: transfer.userModel === 'FieldVisitor' ? user._id : undefined,
                branchId: user.branchId
            });
        } catch (notificationError) {
            console.error('Notification error:', notificationError);
        }

        res.json({
            success: true,
            message: 'Transfer approved and balance deducted',
            balance: user.walletBalance
        });

    } catch (error) {
        if (useTransactions && session) {
            await session.abortTransaction();
        }
        res.status(400).json({ success: false, message: error.message });
    } finally {
        if (session) {
            session.endSession();
        }
    }
};

// @desc    Get company transfers for the current user
// @route   GET /api/wallet/company-transfers
// @access  Private
exports.getCompanyTransfers = async (req, res) => {
    try {
        const userId = req.user._id;
        const transfers = await CompanyTransfer.find({ userId }).sort({ createdAt: -1 });
        res.json({ success: true, count: transfers.length, data: transfers });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
// @desc    Update a pending company transfer
// @route   PUT /api/wallet/company-transfers/:id
// @access  Private
exports.updateCompanyTransfer = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;
        const { amount, depositorName, depositorNic, receiptImage } = req.body;

        const transfer = await CompanyTransfer.findOne({ _id: id, userId });

        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Transfer record not found' });
        }

        if (transfer.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Only pending transfers can be edited' });
        }

        // Update fields if provided
        if (amount !== undefined) transfer.amount = Number(amount);
        if (depositorName !== undefined) transfer.depositorName = depositorName;
        if (depositorNic !== undefined) transfer.depositorNic = depositorNic;
        if (receiptImage !== undefined) {
            if (!receiptImage) throw new Error('Receipt image cannot be empty');
            transfer.receiptUrl = receiptImage; // Store base64 directly
        }

        await transfer.save();

        res.json({
            success: true,
            message: 'Transfer updated successfully',
            data: transfer
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
