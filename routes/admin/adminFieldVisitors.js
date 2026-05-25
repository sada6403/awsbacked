const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Branch = require('../../models/Branch');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const Member = require('../../models/Member');
const Transaction = require('../../models/Transaction');
const { applyBranchScope, canAccessBranch } = require('../../utils/adminAccess');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');
const { buildBranchNameMap } = require('../../utils/branchNameResolver');

// @route   GET /api/admin/field-visitors
// @desc    Get all field visitors
router.get('/', adminOnly, checkPermission('Field Visitors', 'view'), async (req, res) => {
  try {
    const { status, managerId, search } = req.query;
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');

    if (status) {
      query.status = String(status).trim().toLowerCase();
    }
    if (managerId) {
      query.managerId = managerId;
    }
    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [{ name: pattern }, { fullName: pattern }, { email: pattern }, { phone: pattern }, { userId: pattern }];
    }

    const visitors = await FieldVisitor.find(query)
      .sort({ createdAt: -1 })
      .select('-profileImage')
      .lean();
    const branchCodes = [...new Set(visitors.map((visitor) => visitor.branchId).filter(Boolean))];
    const managerIds = [...new Set(visitors.map((visitor) => String(visitor.managerId || '')).filter(Boolean))];
    const [branchNameMap, managers] = await Promise.all([
      buildBranchNameMap(branchCodes),
      BranchManager.find({ _id: { $in: managerIds } }, 'fullName name').lean(),
    ]);
    const managerNameMap = new Map(managers.map((manager) => [String(manager._id), manager.fullName || manager.name]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visitorIds = visitors.map((visitor) => visitor._id);
    const [memberCounts, transactionCounts] = await Promise.all([
      Member.aggregate([
        { $match: { fieldVisitorId: { $in: visitorIds } } },
        { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { fieldVisitorId: { $in: visitorIds }, createdAt: { $gte: today } } },
        { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } },
      ]),
    ]);
    const memberCountMap = new Map(memberCounts.map((item) => [String(item._id), item.count]));
    const transactionCountMap = new Map(transactionCounts.map((item) => [String(item._id), item.count]));
    const visitorsWithStats = visitors.map((visitor) => ({
      ...visitor,
      branchName: branchNameMap.get(visitor.branchId) || visitor.branchId,
      managerName: managerNameMap.get(String(visitor.managerId || '')) || null,
      assignedMembers: memberCountMap.get(String(visitor._id)) || 0,
      todayTransactions: transactionCountMap.get(String(visitor._id)) || 0,
    }));

    res.json({ success: true, data: visitorsWithStats });
  } catch (error) {
    console.error('Fetch Field Visitors Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/field-visitors/:id
// @desc    Get single field visitor
router.get('/:id', adminOnly, checkPermission('Field Visitors', 'view'), async (req, res) => {
  try {
    const visitor = await FieldVisitor.findById(req.params.id);
    if (!visitor) return res.status(404).json({ message: 'Field Visitor not found' });
    if (!canAccessBranch(req.adminUser, visitor.branchId)) {
      return res.status(403).json({ message: 'You cannot view this field visitor' });
    }
    const branch = await Branch.findOne({ branchCode: visitor.branchId }, 'branchCode branchName').lean();
    res.json({ success: true, data: { ...visitor.toObject(), branchName: branch?.branchName || visitor.branchId } });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/field-visitors
// @desc    Create a field visitor
router.post('/', adminOnly, checkPermission('Field Visitors', 'create'), auditLog('Field Visitors', 'CREATE'), async (req, res) => {
  try {
    const visitorData = { ...req.body };
    if (!canAccessBranch(req.adminUser, visitorData.branchId)) {
      return res.status(403).json({ message: 'You cannot create field visitors in this branch' });
    }
    
    const newVisitor = new FieldVisitor(visitorData);
    const savedVisitor = await newVisitor.save();
    res.status(201).json({ success: true, data: savedVisitor });
  } catch (error) {
    console.error('Create Field Visitor Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email or phone already exists' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/field-visitors/:id
// @desc    Update a field visitor
router.put('/:id', adminOnly, checkPermission('Field Visitors', 'edit'), auditLog('Field Visitors', 'UPDATE'), async (req, res) => {
  try {
    const existingVisitor = await FieldVisitor.findById(req.params.id);
    if (!existingVisitor) return res.status(404).json({ message: 'Field Visitor not found' });
    if (!canAccessBranch(req.adminUser, existingVisitor.branchId)) {
      return res.status(403).json({ message: 'You cannot update this field visitor' });
    }

    const updateData = { ...req.body };
    if (updateData.branchId && !canAccessBranch(req.adminUser, updateData.branchId)) {
      return res.status(403).json({ message: 'You cannot move this field visitor to that branch' });
    }

    const updatedVisitor = await FieldVisitor.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    res.json({ success: true, data: updatedVisitor });
  } catch (error) {
    console.error('Update Field Visitor Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/field-visitors/:id
// @desc    Delete a field visitor
router.delete('/:id', adminOnly, checkPermission('Field Visitors', 'delete'), auditLog('Field Visitors', 'DELETE'), async (req, res) => {
  try {
    const existingVisitor = await FieldVisitor.findById(req.params.id);
    if (!existingVisitor) return res.status(404).json({ message: 'Field Visitor not found' });
    if (!canAccessBranch(req.adminUser, existingVisitor.branchId)) {
      return res.status(403).json({ message: 'You cannot delete this field visitor' });
    }

    const memberCount = await Member.countDocuments({ fieldVisitorId: req.params.id });
    if (memberCount > 0) {
      return res.status(400).json({ message: 'Cannot delete field visitor with assigned members' });
    }

    await FieldVisitor.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Field Visitor deleted successfully' });
  } catch (error) {
    console.error('Delete Field Visitor Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/field-visitors/:id/block
// @desc    Block a field visitor
router.post('/:id/block', adminOnly, checkPermission('Field Visitors', 'block'), auditLog('Field Visitors', 'BLOCK'), async (req, res) => {
  try {
    const existingVisitor = await FieldVisitor.findById(req.params.id);
    if (!existingVisitor) return res.status(404).json({ message: 'Field Visitor not found' });
    if (!canAccessBranch(req.adminUser, existingVisitor.branchId)) {
      return res.status(403).json({ message: 'You cannot block this field visitor' });
    }

    const visitor = await FieldVisitor.findByIdAndUpdate(req.params.id, { status: 'blocked' }, { new: true });
    res.json({ success: true, data: visitor });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/field-visitors/:id/unblock
// @desc    Unblock a field visitor
router.post('/:id/unblock', adminOnly, checkPermission('Field Visitors', 'unblock'), auditLog('Field Visitors', 'UNBLOCK'), async (req, res) => {
  try {
    const existingVisitor = await FieldVisitor.findById(req.params.id);
    if (!existingVisitor) return res.status(404).json({ message: 'Field Visitor not found' });
    if (!canAccessBranch(req.adminUser, existingVisitor.branchId)) {
      return res.status(403).json({ message: 'You cannot unblock this field visitor' });
    }

    const visitor = await FieldVisitor.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    res.json({ success: true, data: visitor });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
