const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const AuditLog = require('../../models/AuditLog');
const RequestLog = require('../../models/RequestLog');
const OTPLog = require('../../models/OTPLog');

// @route   GET /api/admin/logs/audit
// @desc    Get all audit logs
router.get('/audit', adminOnly, checkPermission('Audit Logs', 'view'), async (req, res) => {
  try {
    const { module, action, startDate, endDate } = req.query;
    
    let query = {};
    if (module) query.module = module;
    if (action) query.action = action;
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await AuditLog.find(query)
      .populate('userId', 'name role email')
      .sort({ createdAt: -1 })
      .limit(500); // Limit to prevent huge payload

    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Fetch Audit Logs Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/admin/logs/requests
// @desc    Get system request logs
router.get('/requests', adminOnly, checkPermission('Request Logs', 'view'), async (req, res) => {
  try {
    const logs = await RequestLog.find()
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   GET /api/admin/logs/otp
// @desc    Get OTP logs
router.get('/otp', adminOnly, checkPermission('OTP Logs', 'view'), async (req, res) => {
  try {
    const logs = await OTPLog.find()
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
