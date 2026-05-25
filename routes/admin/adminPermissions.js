const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const SubAdminPermission = require('../../models/SubAdminPermission');

// The list of all configurable modules in the system
const ALL_MODULES = [
  'Dashboard', 'Branches', 'Managers', 'Field Visitors', 'Members', 'Extra Members',
  'Manager Members', 'Cash Donors', 'Products', 'Branch Products / Stock',
  'Buy Transactions', 'Sell Transactions', 'All Transactions', 'Wallet Requests',
  'Wallet History', 'Bulk Wallet Recharge', 'Company Transfers', 'Geo Tracking',
  'Farm Mapping', 'Tasks', 'Attendance', 'Notifications', 'Bulk SMS / Email',
  'Notes / Drafts', 'Reports', 'Analytics', 'Forecasting', 'Audit Logs',
  'Request Logs', 'OTP Logs', 'Fraud Alerts', 'Sub Admin Users', 'Roles & Permissions', 'Settings'
];

// @route   GET /api/admin/permissions/modules
// @desc    Get the list of all available permission modules
router.get('/modules', adminOnly, checkPermission('Roles & Permissions', 'view'), (req, res) => {
  res.json({ success: true, data: ALL_MODULES });
});

// @route   GET /api/admin/permissions/:userId
// @desc    Get permissions for a specific sub-admin user
router.get('/:userId', adminOnly, checkPermission('Roles & Permissions', 'view'), async (req, res) => {
  try {
    const permissionDoc = await SubAdminPermission.findOne({ adminUserId: req.params.userId });
    res.json({ success: true, data: permissionDoc?.permissions || [] });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
