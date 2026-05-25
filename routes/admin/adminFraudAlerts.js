const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const FraudAlert = require('../../models/FraudAlert');
const { resolveRequestedBranchCodes } = require('../../utils/adminBranchFilters');

router.get('/', adminOnly, checkPermission('Fraud Alerts', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const query = {};
    if (branchCodes.length > 0) {
      query.branchCode = { $in: branchCodes };
    }
    if (req.query.severity) query.severity = req.query.severity;
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search).trim(), 'i');
      query.$or = [{ type: pattern }, { description: pattern }, { userRole: pattern }];
    }

    const alerts = await FraudAlert.find(query)
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: alerts });
  } catch (error) {
    console.error('Fetch Fraud Alerts Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/:id', adminOnly, checkPermission('Fraud Alerts', 'view'), async (req, res) => {
  try {
    const alert = await FraudAlert.findById(req.params.id).populate('resolvedBy', 'name email').lean();
    if (!alert) return res.status(404).json({ message: 'Fraud Alert not found' });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.post('/:id/review', adminOnly, checkPermission('Fraud Alerts', 'edit'), auditLog('Fraud Alerts', 'REVIEW'), async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ message: 'Review note is required' });
    const alert = await FraudAlert.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          reviewNotes: {
            note,
            addedBy: req.adminUser._id,
            addedAt: new Date(),
          },
        },
        $set: { status: req.body.status || 'Pending' },
      },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: 'Fraud Alert not found' });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.post('/:id/resolve', adminOnly, checkPermission('Fraud Alerts', 'edit'), auditLog('Fraud Alerts', 'RESOLVE'), async (req, res) => {
  try {
    const { investigationNote, status = 'Resolved' } = req.body;
    const alert = await FraudAlert.findByIdAndUpdate(
      req.params.id,
      {
        status,
        investigationNote,
        resolvedBy: req.adminUser.id,
        resolvedAt: new Date(),
      },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: 'Fraud Alert not found' });
    res.json({ success: true, data: alert });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
