const mongoose = require('mongoose');
const Otp = require('../models/Otp');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const ManagersMember = require('../models/ManagersMember');
const ExtraMember = require('../models/ExtraMember');
const BranchManager = require('../models/BranchManager');
const { generateMemberCode } = require('../utils/memberHelper');
const { generateMemberPDF } = require('../utils/memberPdfGenerator');
const { createAndSendNotification } = require('../utils/notificationHelper');
const { emitMemberEvent } = require('../utils/socketService');

// @desc    Send OTP for Member Registration
// @route   POST /api/managers-members/send-otp
// @access  Private (Manager)
const sendRegistrationOtp = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        // Check if member already exists
        const existingMember = await ManagersMember.findOne({ mobile });
        if (existingMember) {
            return res.status(400).json({ success: false, message: 'Member with this mobile number already exists' });
        }

        // Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Save OTP to DB (upsert)
        await Otp.findOneAndUpdate(
            { identifier: mobile },
            { otp, expires: Date.now() + 300000 }, // 5 minutes
            { upsert: true, new: true }
        );

        // Send SMS
        const smsResult = await smsService.sendOTP(mobile, otp);

        if (!smsResult.success) {
            throw new Error(smsResult.error || 'Failed to send SMS');
        }

        const responseData = { success: true, message: 'OTP sent successfully' };
        // In Dev mode (no creds), return OTP to frontend for easy testing
        if (!process.env.MOBITEL_USERNAME) {
            responseData.devOtp = otp;
            console.log(`[Dev] Sending OTP ${otp} to frontend`);
        }

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Send OTP Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send OTP' });
    }
};

// @desc    Send Email OTP for Member Registration
// @route   POST /api/managers-members/send-email-otp
// @access  Private (Manager)
const sendRegistrationEmailOtp = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Check if member already exists with this email
        const existingMember = await ManagersMember.findOne({ email });
        if (existingMember) {
            return res.status(400).json({ success: false, message: 'Member with this email already exists' });
        }

        // Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Save OTP to DB (upsert)
        await Otp.findOneAndUpdate(
            { identifier: email },
            { otp, expires: Date.now() + 300000 }, // 5 minutes
            { upsert: true, new: true }
        );

        // Send Email
        const emailResult = await emailService.sendEmail(
            email,
            'Nature Farming - OTP Verification',
            `Your OTP for member registration is: ${otp}\n\nThis OTP will expire in 5 minutes.\n\nThank you,\nNature Farming`
        );

        if (!emailResult.success) {
            throw new Error(emailResult.error || 'Failed to send email');
        }

        const responseData = { success: true, message: 'Email OTP sent successfully' };
        // In Dev mode, return OTP to frontend
        if (!process.env.MOBITEL_USERNAME) {
            responseData.devOtp = otp;
        }

        res.status(200).json(responseData);
    } catch (error) {
        console.error('Send Email OTP Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to send email OTP' });
    }
};

// @desc    Verify OTPs and Register Member
// @route   POST /api/managers-members/verify-and-register
// @access  Private (Manager)
const verifyOtpsAndRegister = async (req, res) => {
    try {
        let { name, address, mobile, email, nic, mobileOtp, emailOtp } = req.body;
        const managerId = req.user._id;

        if (!name || !address || !mobile || !nic) {
            return res.status(400).json({ success: false, message: 'Name, address, mobile, and NIC are required' });
        }

        // Mobile OTP is always required
        if (!mobileOtp) {
            return res.status(400).json({ success: false, message: 'Mobile OTP is required' });
        }

        // Email OTP is required only if email is provided
        if (email && !emailOtp) {
            return res.status(400).json({ success: false, message: 'Email OTP is required when providing an email address' });
        }

        // Normalize data
        if (nic) nic = nic.trim().toUpperCase();
        if (mobile) mobile = mobile.replace(/\s+/g, '');
        if (email) email = email.trim().toLowerCase();

        // Verify Mobile OTP
        const mobileOtpDoc = await Otp.findOne({ identifier: mobile });
        if (!mobileOtpDoc || mobileOtpDoc.otp !== mobileOtp || mobileOtpDoc.expires < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired mobile OTP' });
        }

        // Verify Email OTP (conditional)
        if (email) {
            const emailOtpDoc = await Otp.findOne({ identifier: email });
            if (!emailOtpDoc || emailOtpDoc.otp !== emailOtp || emailOtpDoc.expires < Date.now()) {
                return res.status(400).json({ success: false, message: 'Invalid or expired email OTP' });
            }
        }

        // Check duplications (Mobile, Email, or NIC)
        const orConditions = [{ mobile }, { nic }];
        if (email) orConditions.push({ email });

        const existingMember = await ManagersMember.findOne({
            $or: orConditions
        });
        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'Member already registered with this mobile number, email, or NIC',
                data: existingMember
            });
        }

        // --- Generate Custom Member ID ---
        const branchId = req.user.branchId || 'default-branch';
        const generatedMemberCode = await generateMemberCode(branchId, req.user.role, req.user);
        // ---------------------------------

        const newMember = new ManagersMember({
            name,
            address,
            mobile,
            email,
            nic,
            memberCode: generatedMemberCode,
            addedBy: managerId,
            branchId: req.user.branchId || 'default-branch',
            createdAt: new Date()
        });

        const savedMember = await newMember.save();

        // Delete used OTPs
        await Otp.deleteMany({ identifier: { $in: [mobile, email] } });

        // Generate PDF
        let pdfUrl = '';
        try {
            pdfUrl = await generateMemberPDF(savedMember);
            savedMember.pdfUrl = pdfUrl;
            await savedMember.save();
        } catch (pdfErr) {
            console.error('Member PDF (Manager) Generation Error:', pdfErr);
        }

        // Create notification
        try {
            await createAndSendNotification({
                title: `Member Registered: ${savedMember.name}`,
                body: `Registration completed successfully for ${savedMember.name}. PDF details are available for download.`,
                date: new Date(),
                attachment: pdfUrl,
                memberId: savedMember._id,
                userId: managerId,
                userRole: 'manager',
                branchId: branchId
            });
        } catch (notifErr) {
            console.error('Notification (Manager) Error:', notifErr);
        }

        // EMIT REAL-TIME UPDATE
        emitMemberEvent('memberCreated', savedMember);

        res.status(201).json({ success: true, message: 'Member registered successfully', data: savedMember, pdfUrl });

    } catch (error) {
        console.error('Register Member Error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Member with this mobile number, email, or NIC already exists'
            });
        }

        res.status(500).json({ success: false, message: 'Failed to register member', error: error.message });
    }
};

// @desc    Register a new Manager's Member (Verify OTP) - Legacy endpoint
// @route   POST /api/managers-members/register
// @access  Private (Manager)
const registerMember = async (req, res) => {
    try {
        let { name, address, mobile, email, nic, idFrontImage, idBackImage } = req.body;
        const managerId = req.user._id;

        if (!name || !address || !mobile || !nic) {
            return res.status(400).json({ success: false, message: 'Name, address, mobile, and NIC are required' });
        }

        // Normalize data
        if (nic) nic = nic.trim().toUpperCase();
        if (mobile) mobile = mobile.replace(/\s+/g, '');

        // Check duplications (Mobile or NIC)
        const existingMember = await ManagersMember.findOne({
            $or: [{ mobile }, { nic }]
        });
        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'Member already registered with this mobile number or NIC',
                data: existingMember
            });
        }

        // --- Generate Custom Member ID ---
        const branchId = req.user.branchId || 'default-branch';
        const generatedMemberCode = await generateMemberCode(branchId, req.user.role, req.user);
        // ---------------------------------

        const newMember = new ManagersMember({
            name,
            address,
            mobile,
            email,
            nic,
            idFrontImage,
            idBackImage,
            memberCode: generatedMemberCode,
            addedBy: managerId,
            branchId: req.user.branchId || 'default-branch',
            createdAt: new Date()
        });

        const savedMember = await newMember.save();

        // Generate PDF
        let pdfUrl = '';
        try {
            pdfUrl = await generateMemberPDF(savedMember);
            savedMember.pdfUrl = pdfUrl;
            await savedMember.save();
        } catch (pdfErr) {
            console.error('Member PDF (Manager Legacy) Generation Error:', pdfErr);
        }

        // Create notification
        try {
            await createAndSendNotification({
                title: `Member Registered: ${savedMember.name}`,
                body: `Registration completed successfully for ${savedMember.name}. PDF details are available for download.`,
                date: new Date(),
                attachment: pdfUrl,
                memberId: savedMember._id,
                userId: managerId,
                userRole: 'manager',
                branchId: branchId
            });
        } catch (notifErr) {
            console.error('Notification (Manager Legacy) Error:', notifErr);
        }

        // EMIT REAL-TIME UPDATE
        emitMemberEvent('memberCreated', savedMember);

        res.status(201).json({ success: true, message: 'Member registered successfully', data: savedMember, pdfUrl });

    } catch (error) {
        console.error('Register Member Error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Member with this mobile number or NIC already exists'
            });
        }

        res.status(500).json({ success: false, message: 'Failed to register member', error: error.message });
    }
};

// @desc    Get all members added by the logged-in manager
// @route   GET /api/managers-members
// @access  Private (Manager)
const getMyMembers = async (req, res) => {
    try {
        const branchId = req.user.branchId || 'default-branch';
        const userOid = new mongoose.Types.ObjectId(req.user._id);

        console.log(`[getMyMembers] Role: ${req.user.role} | Branch: ${branchId} | ID: ${req.user._id}`);

        // Filter by branch if available, otherwise fallback to user specific members
        const branchFilter = (branchId && branchId !== 'default-branch')
            ? { branchId: { $regex: new RegExp(`^${branchId}$`, 'i') } }
            : null;

        const [mgrMembers, extMembers] = await Promise.all([
            ManagersMember.find(branchFilter || { addedBy: userOid })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
            ExtraMember.find(branchFilter || { collectedBy: userOid })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage -biometricData')
                .sort({ collectedAt: -1 })
                .limit(100)
                .lean()
        ]);

        console.log(`[getMyMembers] Found: ManagersMember=${mgrMembers.length}, ExtraMember=${extMembers.length}`);

        // Merge and sort by date with robustness
        const members = [...mgrMembers, ...extMembers].sort((a, b) => {
            const dateA = new Date(a.createdAt || a.collectedAt || 0);
            const dateB = new Date(b.createdAt || b.collectedAt || 0);
            return dateB - dateA;
        });

        res.status(200).json({ success: true, count: members.length, data: members });
    } catch (error) {
        console.error('[getMyMembers] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members',
            error: error.message
        });
    }
};

// @desc    Get recent members added by the logged-in manager
// @route   GET /api/managers-members/recent
// @access  Private (Manager)
const getRecentMembers = async (req, res) => {
    try {
        const branchId = req.user.branchId || 'default-branch';
        const userOid = new mongoose.Types.ObjectId(req.user._id);
        const limit = parseInt(req.query.limit) || 5;

        console.log(`[getRecentMembers] Branch: ${branchId} | Limit: ${limit}`);

        const branchFilter = (branchId && branchId !== 'default-branch')
            ? { branchId: { $regex: new RegExp(`^${branchId}$`, 'i') } }
            : null;

        const [mgrMembers, extMembers] = await Promise.all([
            ManagersMember.find(branchFilter || { addedBy: userOid })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage')
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean(),
            ExtraMember.find(branchFilter || { collectedBy: userOid })
                .select('-profileImage -signatureImage -idFrontImage -idBackImage -biometricData')
                .sort({ collectedAt: -1 })
                .limit(limit)
                .lean()
        ]);

        // Merge and sort
        const members = [...mgrMembers, ...extMembers].sort((a, b) => {
            const dateA = new Date(a.createdAt || a.collectedAt || 0);
            const dateB = new Date(b.createdAt || b.collectedAt || 0);
            return dateB - dateA;
        }).slice(0, limit);

        res.status(200).json({ success: true, count: members.length, data: members });
    } catch (error) {
        console.error('[getRecentMembers] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent members',
            error: error.message
        });
    }
};

// @desc    Get specific member details
// @route   GET /api/managers-members/:memberId
// @access  Private (Manager)
const getMemberDetails = async (req, res) => {
    try {
        const managerId = req.user._id;
        const { memberId } = req.params;
        const userOid = new mongoose.Types.ObjectId(managerId);

        console.log(`[getMemberDetails] Manager: ${managerId} | Member: ${memberId}`);

        let member = await ManagersMember.findOne({
            _id: memberId,
            addedBy: userOid
        });

        if (!member) {
            member = await ExtraMember.findOne({
                _id: memberId,
                collectedBy: userOid
            });
        }

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        res.status(200).json({ success: true, data: member });
    } catch (error) {
        console.error('[getMemberDetails] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member details',
            error: error.message
        });
    }
};

const sendTransactionOtp = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        // Check if member exists and needs OTP
        const existingMember = await ManagersMember.findOne({ mobile });
        if (!existingMember) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        if (existingMember.isFirstTransactionDone) {
            return res.status(400).json({ success: false, message: 'OTP not required for this member' });
        }

        // Generate OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();

        // Save OTP to DB (upsert)
        await Otp.findOneAndUpdate(
            { identifier: mobile },
            { otp, expires: Date.now() + 300000 }, // 5 minutes
            { upsert: true, new: true }
        );

        // Send SMS
        await smsService.sendOTP(mobile, otp);

        res.status(200).json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send Transaction OTP Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

module.exports = {
    sendRegistrationOtp,
    sendRegistrationEmailOtp,
    verifyOtpsAndRegister,
    registerMember,
    getMyMembers,
    getRecentMembers,
    getMemberDetails,
    sendTransactionOtp
};
