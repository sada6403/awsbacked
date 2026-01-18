const sendEmail = require('../utils/emailService');
const FieldVisitor = require('../models/FieldVisitor');
const Otp = require('../models/Otp');
const Notification = require('../models/Notification'); // Moved to top

// @desc    Send verification OTP to email
// @route   POST /api/fieldvisitors/send-otp
// @access  Public (or semi-private, used during reg)
const sendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // 5 mins expiry
        const expires = new Date(Date.now() + 5 * 60 * 1000);

        console.log('### GENERATED EMAIL OTP:', otp);

        // Save to MongoDB for verification
        await Otp.findOneAndUpdate(
            { identifier: email },
            {
                otp,
                expires,
                createdAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const html = `
            <h3>Verification Code</h3>
            <p>Your verification code for Field Visitor Registration is:</p>
            <h1>${otp}</h1>
            <p>This code is valid for 5 minutes.</p>
        `;

        try {
            await sendEmail(email, 'Nature Farming - Verification Code', html);
        } catch (emailError) {
            console.error('Send Email Failed (Mocking success for dev):', emailError.message);
        }

        res.json({
            success: true,
            message: 'OTP sent to email',
            // Return OTP for dev/testing if mail fails
            otp: otp
        });


    } catch (error) {
        console.error('Send Email Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
    }
};

// @desc    Register a new field visitor
// @route   POST /api/fieldvisitors
// @access  Private/Manager
const registerFieldVisitor = async (req, res, next) => {
    try {
        const {
            name, userId, phone, password, email,
            postalAddress, permanentAddress, dob, nic, gender, civilStatus,
            education, bankDetails, workExperience, references
        } = req.body;

        // Validate required fields (userId and password are now auto-generated)
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Please provide all required fields: name, phone' });
        }

        // Validate Bank Details (Compulsory)
        if (!bankDetails || !bankDetails.accountNumber || !bankDetails.bankName) {
            return res.status(400).json({ success: false, message: 'Bank details (Name, Account Number) are compulsory.' });
        }

        // Check if user already exists (Check by NIC or Phone instead since UserID is auto-generated)
        // For now, let's rely on NIC uniqueness if desired, or skip. 
        // We will skip this check for userId as we generate it.



        // Determine Area from input (This fixes 'default-area' display)
        const area = req.body.branch || 'default-area';

        // Determine Branch Code for ID Generation
        let branchCode = 'GEN';

        // logic: FV-(branch 2 letter)-3 digite number
        // "branch 2 letter is similar to brange manager's user id"
        // ex: Manager BM-KM-001 -> Branch Code is KM.
        // ex: Manager MGR-KM-001 -> Branch Code is KM.
        if (req.user && req.user.userId) {
            const parts = req.user.userId.split('-');
            // Expecting format PREFIX-BRANCH-SEQ (MGR-KM-001)
            if (parts.length >= 2) {
                branchCode = parts[1];
            }
        } else if (area !== 'default-area') {
            // Fallback: use first 2 letters of the provided branch name
            branchCode = area.substring(0, 2).toUpperCase();
        }

        // Generate User ID: FV-{BranchCode}-XXX
        // Count existing users with this pattern to determine sequence
        const count = await FieldVisitor.countDocuments({
            userId: { $regex: new RegExp(`^FV-${branchCode}-\\d{3}$`) }
        });
        const sequence = (count + 1).toString().padStart(3, '0');
        const generatedUserId = `FV-${branchCode}-${sequence}`;

        // Generate Random Password: NF + 5 random digits
        const generatedPassword = 'NF' + Math.floor(10000 + Math.random() * 90000).toString();

        // Create new field visitor instance
        const newFieldVisitor = new FieldVisitor({
            name,
            userId: generatedUserId, // Override input
            phone,
            password: generatedPassword, // Override input
            email,

            // New Fields
            postalAddress, permanentAddress, dob, nic, gender, civilStatus,
            education, bankDetails, workExperience, references,

            managerId: req.user ? req.user._id : undefined,
            branchId: req.user?.branchId || area, // Use manager's branch or input area
            area: area // Explicitly save the area
        });

        // Await the save operation properly
        const savedFieldVisitor = await newFieldVisitor.save();

        // Send credentials email
        if (email) {
            const html = `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <div style="background-color: #2e7d32; padding: 20px; text-align: center;">
                         <h1 style="color: white; margin: 0;">Welcome to Nature Farming</h1>
                    </div>
                    <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
                        <p>Dear ${name},</p>
                        <p>You have been successfully registered as a Field Visitor.</p>
                        <p><strong>Your Credentails:</strong></p>
                        <ul>
                            <li><strong>User ID:</strong> ${generatedUserId}</li>
                            <li><strong>Password:</strong> ${generatedPassword}</li>
                        </ul>
                        <p>Please keep these credentials safe.</p>
                        <br>
                        <p>Best Regards,<br>Nature Farming Team</p>
                    </div>
                </div>
            `;
            // Fire and forget email to not block response
            try {
                await sendEmail(email, 'Registration Successful - Credentials', html);
            } catch (err) {
                console.error('Failed to send welcome email', err);
            }
        }

        // CREATE NOTIFICATION FOR MANAGER
        try {
            if (req.user && req.user._id) {
                await Notification.create({
                    title: `Field Visitor Registered: ${name}`,
                    body: `New Field Visitor ${name} (${generatedUserId}) has been registered in ${area}.`,
                    date: new Date(),
                    userId: req.user._id, // Notify the Manager who created it
                    userRole: req.user.role,
                    managerId: req.user._id,
                    fieldVisitorId: savedFieldVisitor._id, // Store ID for Deep Linking
                    branchId: req.user.branchId,
                    isRead: false
                });
            }
        } catch (notifyErr) {
            console.error('Failed to create registration notification:', notifyErr.message);
        }

        // Return the saved document immediately with consistent field names
        res.status(201).json({
            success: true,
            message: 'Field Visitor registered successfully',
            data: {
                id: savedFieldVisitor._id.toString(), // Use 'id' for Flutter compatibility
                _id: savedFieldVisitor._id,
                name: savedFieldVisitor.name,
                userId: generatedUserId,
                // Return RAW password so frontend can display it one-time
                tempPassword: generatedPassword,
                phone: savedFieldVisitor.phone,
                branchId: savedFieldVisitor.branchId,
                status: savedFieldVisitor.status,
                role: 'field_visitor',
                createdAt: savedFieldVisitor.createdAt
            }
        });
    } catch (error) {
        console.error('Field Visitor Registration Error:', error);

        // Duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Field Visitor with this User ID already exists'
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

// @desc    Get all field visitors
// @route   GET /api/fieldvisitors
// @access  Private
const getFieldVisitors = async (req, res) => {
    const pageSize = 10;
    const page = Number(req.query.pageNumber) || 1;

    const branchId = req.user?.branchId || 'default-branch';
    const count = await FieldVisitor.countDocuments({ branchId });
    const fieldVisitors = await FieldVisitor.find({ branchId })
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .lean(); // Use lean to get plain JS objects

    res.json({ fieldVisitors, page, pages: Math.ceil(count / pageSize) });
};

// Notification require moved to top

// @desc    Get single field visitor by ID
// @route   GET /api/fieldvisitors/:id
// @access  Private
const getFieldVisitorById = async (req, res) => {
    try {
        const fieldVisitor = await FieldVisitor.findById(req.params.id)
            .select('-password') // Exclude password
            .lean();

        if (fieldVisitor) {
            res.json(fieldVisitor);
        } else {
            res.status(404).json({ message: 'Field Visitor not found' });
        }
    } catch (error) {
        console.error('Fetch FV By ID Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Test Email Sending
// @route   GET /api/fieldvisitors/test-email
// @access  Public
const sendTestEmail = async (req, res) => {
    try {
        const testEmail = process.env.EMAIL_USER; // Send to self (the sender)
        if (!testEmail) {
            return res.status(500).json({ success: false, message: 'EMAIL_USER not set in env' });
        }

        console.log('Testing Email Routes... Sending to:', testEmail);

        // Mock a bill
        const result = await emailService.sendBillEmail(testEmail, {
            name: 'Test User',
            type: 'TEST-TRANSACTION',
            billNumber: 'TEST-001',
            date: new Date().toLocaleDateString(),
            amount: 100.00
        }, null); // No attachment for basic test

        if (result.success) {
            res.json({ success: true, message: `Email sent to ${testEmail}`, result });
        } else {
            res.status(500).json({ success: false, message: 'Email failed', error: result.error });
        }
    } catch (error) {
        console.error('Test Email Error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

module.exports = { registerFieldVisitor, getFieldVisitors, getFieldVisitorById, sendVerificationEmail, sendTestEmail };
