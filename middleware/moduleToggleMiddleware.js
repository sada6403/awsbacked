const DISABLED_ADMIN_MODULES = new Set([
  'geo-tracking',
  'tasks',
  'attendance',
  'logs',
]);

function disableAdminModule(moduleKey) {
  return (req, res, next) => {
    if (DISABLED_ADMIN_MODULES.has(moduleKey)) {
      return res.status(404).json({ message: 'This module is currently disabled' });
    }

    next();
  };
}

module.exports = {
  DISABLED_ADMIN_MODULES,
  disableAdminModule,
};
