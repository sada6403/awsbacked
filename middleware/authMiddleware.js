const jwt = require('jsonwebtoken');
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Load user by role
            if (decoded.role === 'manager') {
                req.user = await BranchManager.findById(decoded.id).select('-password');
                if (!req.user) throw new Error('Manager not found');
                req.user.role = 'manager';
            } else if (decoded.role === 'field_visitor') {
                req.user = await FieldVisitor.findById(decoded.id).select('-password');
                if (!req.user) throw new Error('Field visitor not found');
                req.user.role = 'field_visitor';
            } else {
                return res.status(401).json({ message: 'Not authorized, invalid role' });
            }

            // Attach branchId (prefer user document (fresh), fallback to token, then default)
            req.user.branchId = req.user?.branchId || decoded.branchId || 'default-branch';

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            const role = req.user?.role || 'unknown';
            return res.status(403).json({ message: `User role ${role} is not authorized to access this route` });
        }
        next();
    };
};

module.exports = { protect, authorize };
