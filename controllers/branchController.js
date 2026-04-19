const Branch = require('../models/Branch');

// @desc    Get all active branches
// @route   GET /api/branches
// @access  Public
const getBranches = async (req, res, next) => {
    try {
        const branches = await Branch.find({ status: 'active' }).sort({ branchName: 1 });
        res.json({
            success: true,
            count: branches.length,
            data: branches
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new branch
// @route   POST /api/branches
// @access  Private (Admin/Manager)
const createBranch = async (req, res, next) => {
    try {
        const { branchName, branchCode, address, phone, email } = req.body;

        if (!branchName || !branchCode) {
            return res.status(400).json({
                success: false,
                message: 'Please provide branchName and branchCode'
            });
        }

        const branch = await Branch.create({
            branchName,
            branchCode,
            address,
            phone,
            email
        });

        res.status(201).json({
            success: true,
            data: branch
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Branch name or code already exists'
            });
        }
        next(error);
    }
};

// @desc    Update branch details
// @route   PUT /api/branches/:id
// @access  Private (Admin/Manager)
const updateBranch = async (req, res, next) => {
    try {
        const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!branch) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getBranches,
    createBranch,
    updateBranch
};
