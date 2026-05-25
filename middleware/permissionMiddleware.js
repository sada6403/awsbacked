const SubAdminPermission = require('../models/SubAdminPermission');

const permissionMiddleware = (moduleName, requiredAction) => {
  return async (req, res, next) => {
    try {
      const adminUser = req.adminUser;
      
      if (!adminUser) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      if (adminUser.role === 'SuperAdmin') {
        return next(); // Super Admin has all permissions
      }

      const permissionDoc = await SubAdminPermission.findOne({ adminUserId: adminUser._id });
      if (!permissionDoc) {
        return res.status(403).json({ message: 'No permissions assigned' });
      }

      const modulePerms = permissionDoc.permissions.find(p => p.module === moduleName);
      if (!modulePerms) {
        return res.status(403).json({ message: `No permissions for module: ${moduleName}` });
      }

      let hasPermission = false;
      switch (requiredAction) {
        case 'view': hasPermission = modulePerms.canView; break;
        case 'create': hasPermission = modulePerms.canCreate; break;
        case 'edit': hasPermission = modulePerms.canEdit; break;
        case 'delete': hasPermission = modulePerms.canDelete; break;
        case 'approve': hasPermission = modulePerms.canApprove; break;
        case 'reject': hasPermission = modulePerms.canReject; break;
        case 'export': hasPermission = modulePerms.canExport; break;
        case 'block': hasPermission = modulePerms.canBlock; break;
        case 'unblock': hasPermission = modulePerms.canUnblock; break;
        default: hasPermission = false;
      }

      if (!hasPermission) {
        return res.status(403).json({ message: `Permission denied: Cannot ${requiredAction} ${moduleName}` });
      }

      next();
    } catch (error) {
      console.error('Permission Error:', error);
      res.status(500).json({ message: 'Server error during permission check' });
    }
  };
};

module.exports = permissionMiddleware;
