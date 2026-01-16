const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const generateToken = require('../utils/generateToken');

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
    try {
        const { username, password, role } = req.body; // username can be email or userId

        if (!username || !password || !role) {
            res.status(400);
            throw new Error('Please provide all credentials');
        }

        let user;

        if (role === 'manager') {
            // Manager login by email or userId
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
                role: role,
                branchId,
                branchName: user.branchName || '', // Return branch name
                token: generateToken(user._id, role === 'field' ? 'field_visitor' : 'manager', branchId),
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
        const { fullName, email, password, userId, branchName, branchId, phone } = req.body;

        // Validate required fields
        if (!fullName || !email || !password || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: fullName, email, password, userId'
            });
        }

        // Check if manager already exists
        const managerExists = await BranchManager.findOne({
            $or: [{ email }, { userId }]
        });
        if (managerExists) {
            return res.status(400).json({
                success: false,
                message: 'Manager with this email or userId already exists'
            });
        }

        // Create new manager instance
        const newManager = new BranchManager({
            fullName,
            email,
            password,
            userId,
            branchName: branchName || 'Kalmunai',
            branchId: branchId || 'branch-default',
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
                role: 'manager',
                branchId: savedManager.branchId,
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

module.exports = { loginUser, registerManager };
