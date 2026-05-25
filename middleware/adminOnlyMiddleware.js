const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const SubAdminPermission = require('../models/SubAdminPermission');

const adminOnlyMiddleware = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretOrPrivateKey');
    const adminUser = await AdminUser.findById(decoded.id).select('-passwordHash');

    if (!adminUser) {
      return res.status(401).json({ message: 'Not authorized, invalid admin token' });
    }
    
    if (adminUser.status !== 'active') {
      return res.status(403).json({ message: 'Admin account is blocked' });
    }

    if (adminUser.role !== 'SuperAdmin') {
      const permissionDoc = await SubAdminPermission.findOne({ adminUserId: adminUser._id }).lean();
      adminUser.permissions = permissionDoc?.permissions || [];
    } else {
      adminUser.permissions = [];
    }

    req.adminUser = adminUser;
    next();
  } catch (error) {
    console.error('Admin Auth Error:', error);
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = adminOnlyMiddleware;
