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
            const decodedRole = (decoded.role || '').toLowerCase().replace(/\s/g, '_');
            if (decodedRole === 'manager' || decodedRole === 'branch_manager' || decodedRole === 'admin' || decodedRole === 'super_admin') {
                req.user = await BranchManager.findById(decoded.id).select('-password');
                if (!req.user) {
                    console.error(`[AUTH ERROR] Admin/Manager not found for ID: ${decoded.id}`);
                    throw new Error('User not found');
                }
                // Preserving the actual role from DB (e.g. SUPER_ADMIN)
                req.user.role = req.user.role || decoded.role;
            } else if (decoded.role === 'field_visitor') {
                req.user = await FieldVisitor.findById(decoded.id).select('-password');
                if (!req.user) {
                    console.error(`[AUTH ERROR] Field visitor not found for ID: ${decoded.id}`);
                    throw new Error('Field visitor not found');
                }
                req.user.role = 'field_visitor';
            } else {
                console.error(`[AUTH ERROR] Invalid role in token: ${decoded.role}`);
                return res.status(401).json({ message: 'Not authorized, invalid role' });
            }

            // Attach branchId and normalize role
            if (req.user) {
                req.user.branchId = req.user.branchId || decoded.branchId || 'default-branch';
                
                // Normalize role for consistent controller checks
                const rawRole = (req.user.role || '').toLowerCase().trim();
                if (rawRole === 'manager' || rawRole === 'branch manager' || rawRole === 'branch_manager' || rawRole === 'admin' || rawRole === 'super_admin') {
                    req.user.isManager = true;
                    // For legacy controllers that check role === 'manager'
                    if (rawRole === 'branch manager' || rawRole === 'branch_manager') {
                        req.user.role = 'manager'; 
                    }
                } else {
                    req.user.isManager = false;
                }
            }

            next();
        } catch (error) {
            console.error('[AUTH ERROR] Middleware rejection:', error.message || error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authorized, no user data' });
        }

        const userRole = req.user.role;
        // Normalize role strings for consistency (e.g. "Branch Manager" -> "manager")
        const normalizedRole = (userRole || '').toLowerCase().replace(/\s/g, '_');
        const effectiveRole = (normalizedRole === 'branch_manager') ? 'manager' : normalizedRole;

        const isAuthorized = roles.some(role => {
            const r = role.toLowerCase().replace(/\s/g, '_');
            return r === normalizedRole || r === effectiveRole;
        }) || normalizedRole === 'super_admin';

        if (!isAuthorized) {
            console.error(`[AUTH ERROR] Role mismatch. User: ${req.user.userId} Role: ${userRole} Required: ${roles.join(', ')}`);
            return res.status(403).json({ message: `User role ${userRole} is not authorized to access this route` });
        }
        next();
    };
};

module.exports = { protect, authorize };
