const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const generateToken = require('../utils/generateToken');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
    console.log('\n[DEBUG] Login Attempt Started');
    console.log('[DEBUG] Body:', JSON.stringify(req.body, null, 2));
    try {
        const { username, password, role } = req.body; // username can be email or userId

        if (!username || !password || !role) {
            console.log('[DEBUG] Missing credentials');
            res.status(400);
            throw new Error('Please provide all credentials');
        }
        let user;

        if (role === 'manager') {

            // 1. Find user in BranchManager collection
            user = await BranchManager.findOne({
                $or: [{ email: username }, { userId: username }]
            });
        } else if (role === 'field' || role === 'field_visitor') {
            // Field Visitor login by userId
            user = await FieldVisitor.findOne({ userId: username });
        } else {
            res.status(400);
            throw new Error('Invalid role');
        }

        if (user && (await user.matchPassword(password))) {
            const branchId = user.branchId || 'default-branch';
            const userData = {
                id: user._id.toString(), // Use 'id' instead of '_id' for Flutter compatibility
                _id: user._id,
                name: user.fullName || user.name,
                email: user.email,
                code: user.userId || user.code,
                role: user.role || role,
                branchId,
                branchName: user.branchName || '', // Return branch name
                profileImage: user.profileImage, // Return profile image
                token: generateToken(user._id, user.role || (role === 'field' ? 'field_visitor' : 'manager'), branchId),
            };

            // Add phone field for all users
            userData.phone = user.phone || '';
            if (user.userId) {
                userData.userId = user.userId;
            }

            res.json({
                success: true,
                data: userData
            });
        } else {
            res.status(401);
            throw new Error('Invalid credentials');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Register a new manager
// @route   POST /api/auth/register
// @access  Public (or Private depending on your requirements)
const registerManager = async (req, res, next) => {
    try {
        const { fullName, email, password, branchName, phone } = req.body;

        // Validate required fields (userId is now auto-generated)
        if (!fullName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: fullName, email, password'
            });
        }

        // Check if manager already exists by email
        const managerExists = await BranchManager.findOne({ email });
        if (managerExists) {
            return res.status(400).json({
                success: false,
                message: 'Manager with this email already exists'
            });
        }

        // Auto-generate userId using smart branch code generation
        const { generateUniqueBranchCode, getNextSequence } = require('../utils/branchCodeGenerator');

        // Generate unique branch code from manager's name (2-4 letters with collision detection)
        const branchCode = await generateUniqueBranchCode(fullName, 'manager');

        // Get next sequence number for this branch code
        const sequence = await getNextSequence(branchCode, 'BM');

        // Generate userId: BM-{BranchCode}-{Sequence}
        const userId = `BM-${branchCode}-${sequence}`;

        // Create new manager instance
        const newManager = new BranchManager({
            fullName,
            email,
            password,
            userId, // Auto-generated
            branchName: branchName || 'Default Branch',
            branchId: branchCode.toLowerCase(), // Use branch code as branchId
            phone: phone || '',
            role: 'branch_manager',
            status: 'active'
        });

        // Await the save operation properly (password will be hashed by pre-save hook)
        const savedManager = await newManager.save();

        // Return the saved document immediately with consistent field names
        res.status(201).json({
            success: true,
            message: 'Manager registered successfully',
            data: {
                id: savedManager._id.toString(), // Use 'id' for Flutter compatibility
                _id: savedManager._id,
                name: savedManager.fullName,
                email: savedManager.email,
                code: savedManager.userId,
                userId: savedManager.userId, // Include userId for clarity
                role: 'manager',
                branchId: savedManager.branchId,
                branchCode: branchCode, // Return branch code for reference
                phone: savedManager.phone,
                token: generateToken(savedManager._id, 'manager', savedManager.branchId)
            }
        });
    } catch (error) {
        console.error('Manager Registration Error:', error);

        // Duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email or userId already exists'
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

// @desc    Update manager details
// @route   PUT /api/auth/manager/:id
// @access  Private
const updateManager = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Prevent updating sensitive fields
        delete updates.password;
        delete updates.walletBalance;
        delete updates.userId;
        delete updates.branchId;

        const manager = await BranchManager.findByIdAndUpdate(id, updates, {
            new: true,
            runValidators: true
        }).select('-password');

        if (!manager) {
            return res.status(404).json({ success: false, message: 'Manager not found' });
        }

        res.json({ success: true, data: manager });
    } catch (error) {
        console.error('Update Manager Error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Get manager details by ID
// @route   GET /api/auth/manager/:id
// @access  Private
const getManagerById = async (req, res) => {
    try {
        const manager = await BranchManager.findById(req.params.id).select('-password');
        if (manager) {
            res.json({ success: true, data: manager });
        } else {
            res.status(404).json({ success: false, message: 'Manager not found' });
        }
    } catch (error) {
        console.error('Get Manager Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update FCM token
// @route   POST /api/auth/fcm-token
// @access  Private
const updateFcmToken = async (req, res, next) => {
    try {
        const { fcmToken } = req.body;
        const userId = req.user._id;
        const role = req.user.role;

        if (!fcmToken) {
            res.status(400);
            throw new Error('Please provide FCM token');
        }

        let user;
        if (role === 'manager' || role === 'branch_manager') {
            user = await BranchManager.findByIdAndUpdate(userId, { fcmToken }, { new: true });
        } else {
            user = await FieldVisitor.findByIdAndUpdate(userId, { fcmToken }, { new: true });
        }

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        res.json({
            success: true,
            message: 'FCM token updated successfully'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Change Password
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user._id;
        const role = req.user.role;

        if (!oldPassword || !newPassword) {
            res.status(400);
            throw new Error('Please provide old and new password');
        }

        let user;
        if (role === 'manager' || role === 'branch_manager') {
            user = await BranchManager.findById(userId);
        } else {
            user = await FieldVisitor.findById(userId);
        }

        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        // Check if old password matches
        if (!(await user.matchPassword(oldPassword))) {
            res.status(401);
            throw new Error('Incorrect old password');
        }

        // Set new password (the model pre-save hook will hash it)
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { loginUser, registerManager, updateManager, getManagerById, updateFcmToken, changePassword };
