const AuditLog = require('../models/AuditLog');

const auditLogMiddleware = (moduleName, actionType) => {
  return async (req, res, next) => {
    // Capture the original response json method to log after request is handled
    const originalJson = res.json;
    
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Log asynchronously, no need to wait
        try {
          const logEntry = new AuditLog({
            userId: req.adminUser ? req.adminUser._id : null,
            userName: req.adminUser ? req.adminUser.name : 'System',
            userRole: req.adminUser ? req.adminUser.role : 'System',
            action: actionType,
            module: moduleName,
            // Assuming the handled object id might be in req.params.id or the response data
            documentId: req.params.id || (data && data._id ? data._id : null),
            ipAddress: req.ip || req.connection.remoteAddress,
            deviceInfo: req.headers['user-agent']
          });
          
          logEntry.save().catch(err => console.error('Failed to save audit log:', err));
        } catch (error) {
          console.error('Audit Log Middleware Error:', error);
        }
      }
      
      return originalJson.apply(this, arguments);
    };
    
    next();
  };
};

module.exports = auditLogMiddleware;
