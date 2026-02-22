const Otp = require('../models/Otp');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const ExtraMember = require('../models/ExtraMember');
const BranchManager = require('../models/BranchManager');

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
        const existingMember = await ExtraMember.findOne({ mobile });
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
        const existingMember = await ExtraMember.findOne({ email });
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

        // Check duplications
        const orConditions = [{ mobile }];
        if (email) orConditions.push({ email });

        const existingMember = await ExtraMember.findOne({
            $or: orConditions
        });
        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'Member already registered with this mobile number or email',
                data: existingMember
            });
        }

        // --- Generate Custom Member ID (Logic mirrored from memberController) ---
        let generatedMemberCode;
        let branchCode = 'XX'; // Default

        // 1. Get Branch Code from Manager's Branch Name
        const branchNameStr = req.user.branchName || '';

        // Map branch name to 2-letter code
        if (branchNameStr) {
            const nameUpper = branchNameStr.toUpperCase();
            if (nameUpper.includes('KALMUNAI')) branchCode = 'KA';
            else if (nameUpper.includes('TRINCO')) branchCode = 'TR';
            else if (nameUpper.includes('KONDAVIL')) branchCode = 'JK'; // Jaffna (Kondavil)
            else if (nameUpper.includes('SAVAGACHERI') || nameUpper.includes('CHAVAKACHCHERI')) branchCode = 'JS'; // Jaffna (Savagacheri)
            else branchCode = nameUpper.substring(0, 2);
        }

        // 2. Find last member code for this branch prefix to determine sequence
        const prefix = `FA${branchCode}`;
        const lastMember = await ExtraMember.findOne({
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
        // -----------------------------------------------------------------------

        const newMember = new ExtraMember({
            name,
            address,
            mobile,
            email,
            nic,
            memberCode: generatedMemberCode,
            collectedBy: managerId,
            branchId: req.user.branchId || 'default-branch',
            collectedAt: new Date()
        });

        const savedMember = await newMember.save();

        // --- SYNCHRONIZE TO CENTRAL MEMBER COLLECTION ---
        try {
            const Member = require('../models/Member');
            const memberData = {
                _id: savedMember._id, // Keep same ID
                name: savedMember.name,
                address: savedMember.address,
                mobile: savedMember.mobile,
                email: savedMember.email,
                nic: savedMember.nic,
                memberCode: savedMember.memberCode,
                // fieldVisitorId: undefined, // Manager members don't have a field visitor
                // Note: If Member schema requires fieldVisitorId, we might need a dummy or the Manager's ID if schema allows.
                // For now, assuming Member schema permits optional or we are okay with sync failing if strict.
                // Ideally, Manager ID should be used if Member schema `ref` allows BranchManager, 
                // but usually it refers to FieldVisitor. 
                // We'll proceed with sending memberCode which is the critical fix for Dashboard counts.

                branchId: savedMember.branchId,
                area: 'Manager-Office',
                registeredAt: savedMember.collectedAt,
            };

            await Member.findOneAndUpdate(
                { mobile: savedMember.mobile },
                memberData,
                { upsert: true, new: true }
            );
            console.log(`[Sync] Manager Member ${savedMember.mobile} synced with code ${savedMember.memberCode}.`);
        } catch (syncError) {
            console.error('[Sync] Failed:', syncError);
        }
        // ------------------------------------------------

        // Delete used OTPs
        await Otp.deleteMany({ identifier: { $in: [mobile, email] } });

        res.status(201).json({ success: true, message: 'Member registered successfully', data: newMember });

    } catch (error) {
        console.error('Register Member Error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Member with this mobile number or email already exists'
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

        // Check duplications
        const existingMember = await ExtraMember.findOne({ mobile });
        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'Member already registered with this mobile number',
                data: existingMember
            });
        }

        // --- Generate Custom Member ID (Logic mirrored from memberController) ---
        let generatedMemberCode;
        let branchCode = 'XX'; // Default

        // 1. Get Branch Code from Manager's Branch Name
        const branchNameStr = req.user.branchName || '';

        // Map branch name to 2-letter code
        if (branchNameStr) {
            const nameUpper = branchNameStr.toUpperCase();
            if (nameUpper.includes('KALMUNAI')) branchCode = 'KA';
            else if (nameUpper.includes('TRINCO')) branchCode = 'TR';
            else if (nameUpper.includes('KONDAVIL')) branchCode = 'JK'; // Jaffna (Kondavil)
            else if (nameUpper.includes('SAVAGACHERI') || nameUpper.includes('CHAVAKACHCHERI')) branchCode = 'JS'; // Jaffna (Savagacheri)
            else branchCode = nameUpper.substring(0, 2);
        }

        // 2. Find last member code for this branch prefix to determine sequence
        const prefix = `FA${branchCode}`;
        const lastMember = await ExtraMember.findOne({
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
        // -----------------------------------------------------------------------

        const newMember = new ExtraMember({
            name,
            address,
            mobile,
            email,
            nic,
            idFrontImage,
            idBackImage,
            memberCode: generatedMemberCode,
            collectedBy: managerId,
            branchId: req.user.branchId || 'default-branch',
            collectedAt: new Date()
        });

        const savedMember = await newMember.save();

        // --- SYNCHRONIZE TO CENTRAL MEMBER COLLECTION ---
        try {
            const Member = require('../models/Member');
            const memberData = {
                _id: savedMember._id,
                name: savedMember.name,
                address: savedMember.address,
                mobile: savedMember.mobile,
                email: savedMember.email,
                nic: savedMember.nic,
                memberCode: savedMember.memberCode,
                idFrontImage: savedMember.idFrontImage,
                idBackImage: savedMember.idBackImage,
                branchId: savedMember.branchId,
                area: 'Manager-Office',
                registeredAt: savedMember.collectedAt,
            };

            await Member.findOneAndUpdate(
                { mobile: savedMember.mobile },
                memberData,
                { upsert: true, new: true }
            );
        } catch (syncError) {
            console.error('[Sync] Failed:', syncError);
        }

        res.status(201).json({ success: true, message: 'Member registered successfully', data: savedMember });

    } catch (error) {
        console.error('Register Member Error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Member with this mobile number already exists'
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
        const managerId = req.user._id;
        const members = await ExtraMember.find({ collectedBy: managerId }).sort({ collectedAt: -1 });
        res.status(200).json({ success: true, count: members.length, data: members });
    } catch (error) {
        console.error('Get Members Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch members' });
    }
};

// @desc    Get recent members added by the logged-in manager
// @route   GET /api/managers-members/recent
// @access  Private (Manager)
const getRecentMembers = async (req, res) => {
    try {
        const managerId = req.user._id;
        const limit = parseInt(req.query.limit) || 5;

        const members = await ExtraMember.find({ collectedBy: managerId })
            .sort({ collectedAt: -1 })
            .limit(limit);

        res.status(200).json({ success: true, count: members.length, data: members });
    } catch (error) {
        console.error('Get Recent Members Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch recent members' });
    }
};

// @desc    Get specific member details
// @route   GET /api/managers-members/:memberId
// @access  Private (Manager)
const getMemberDetails = async (req, res) => {
    try {
        const managerId = req.user._id;
        const { memberId } = req.params;

        const member = await ExtraMember.findOne({
            _id: memberId,
            collectedBy: managerId
        });

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        res.status(200).json({ success: true, data: member });
    } catch (error) {
        console.error('Get Member Details Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch member details' });
    }
};

const sendTransactionOtp = async (req, res) => {
    try {
        const { mobile } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number is required' });
        }

        // Check if member exists and needs OTP
        const existingMember = await ExtraMember.findOne({ mobile });
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
