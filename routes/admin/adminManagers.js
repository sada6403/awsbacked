const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Branch = require('../../models/Branch');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const Member = require('../../models/Member');
const { applyBranchScope, canAccessBranch } = require('../../utils/adminAccess');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');
const { buildBranchNameMap } = require('../../utils/branchNameResolver');
const { syncBranchesFromManagers } = require('../../utils/branchSync');

// @route   GET /api/admin/managers
// @desc    Get all managers
router.get('/', adminOnly, checkPermission('Managers', 'view'), async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');

    if (status) {
      query.status = String(status).trim().toLowerCase();
    }

    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [{ fullName: pattern }, { email: pattern }, { phone: pattern }, { userId: pattern }];
    }

    const managers = await BranchManager.find(query).sort({ createdAt: -1 }).select('-profileImage').lean();
    const managerIds = managers.map((m) => m._id);
    const branchCodes = [...new Set(managers.map((m) => m.branchId).filter(Boolean))];

    const [branchNameMap, allFieldVisitors] = await Promise.all([
      buildBranchNameMap(branchCodes),
      FieldVisitor.find({ managerId: { $in: managerIds } }, 'managerId memberCount').lean(),
    ]);
    const fvByManager = new Map();
    for (const fv of allFieldVisitors) {
      const mid = String(fv.managerId);
      if (!fvByManager.has(mid)) fvByManager.set(mid, []);
      fvByManager.get(mid).push(fv);
    }

    const managersWithStats = managers.map((manager) => {
      const fvs = fvByManager.get(String(manager._id)) ?? [];
      return {
        ...manager,
        name: manager.fullName || manager.name,
        branchName: branchNameMap.get(manager.branchId) || manager.branchName,
        totalFieldVisitors: fvs.length,
        totalMembers: fvs.reduce((sum, fv) => sum + (fv.memberCount || 0), 0),
      };
    });

    res.json({ success: true, data: managersWithStats });
  } catch (error) {
    console.error('Fetch Managers Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/managers/:id
// @desc    Get single manager details
router.get('/:id', adminOnly, checkPermission('Managers', 'view'), async (req, res) => {
  try {
    const manager = await BranchManager.findById(req.params.id);
    if (!manager) return res.status(404).json({ message: 'Manager not found' });
    if (!canAccessBranch(req.adminUser, manager.branchId)) {
      return res.status(403).json({ message: 'You cannot view this manager' });
    }
    const branch = await Branch.findOne({ branchCode: manager.branchId }, 'branchCode branchName').lean();
    res.json({ success: true, data: { ...manager.toObject(), branchName: branch?.branchName || manager.branchName } });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/managers
// @desc    Create a manager
router.post('/', adminOnly, checkPermission('Managers', 'create'), auditLog('Managers', 'CREATE'), async (req, res) => {
  try {
    const managerData = { ...req.body };
    if (!canAccessBranch(req.adminUser, managerData.branchId)) {
      return res.status(403).json({ message: 'You cannot create managers in this branch' });
    }
    const branch = await Branch.findOne({ branchCode: managerData.branchId }, 'branchCode branchName').lean();
    if (!branch) {
      return res.status(400).json({ message: 'Selected branch not found' });
    }
    managerData.branchName = branch.branchName;
    
    const newManager = new BranchManager(managerData);
    const savedManager = await newManager.save();
    res.status(201).json({ success: true, data: savedManager });
  } catch (error) {
    console.error('Create Manager Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email or phone already exists' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/managers/:id
// @desc    Update a manager
router.put('/:id', adminOnly, checkPermission('Managers', 'edit'), auditLog('Managers', 'UPDATE'), async (req, res) => {
  try {
    const existingManager = await BranchManager.findById(req.params.id);
    if (!existingManager) return res.status(404).json({ message: 'Manager not found' });
    if (!canAccessBranch(req.adminUser, existingManager.branchId)) {
      return res.status(403).json({ message: 'You cannot update this manager' });
    }

    const updateData = { ...req.body };
    if (updateData.branchId && !canAccessBranch(req.adminUser, updateData.branchId)) {
      return res.status(403).json({ message: 'You cannot move this manager to that branch' });
    }
    if (updateData.branchId) {
      const branch = await Branch.findOne({ branchCode: updateData.branchId }, 'branchCode branchName').lean();
      if (!branch) {
        return res.status(400).json({ message: 'Selected branch not found' });
      }
      updateData.branchName = branch.branchName;
    }
    const updatedManager = await BranchManager.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    res.json({ success: true, data: updatedManager });
  } catch (error) {
    console.error('Update Manager Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/managers/:id
// @desc    Delete a manager
router.delete('/:id', adminOnly, checkPermission('Managers', 'delete'), auditLog('Managers', 'DELETE'), async (req, res) => {
  try {
    const existingManager = await BranchManager.findById(req.params.id);
    if (!existingManager) return res.status(404).json({ message: 'Manager not found' });
    if (!canAccessBranch(req.adminUser, existingManager.branchId)) {
      return res.status(403).json({ message: 'You cannot delete this manager' });
    }

    const fvCount = await FieldVisitor.countDocuments({ managerId: req.params.id });
    if (fvCount > 0) {
      return res.status(400).json({ message: 'Cannot delete manager with assigned field visitors' });
    }

    await BranchManager.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Manager deleted successfully' });
  } catch (error) {
    console.error('Delete Manager Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/managers/:id/block
// @desc    Block a manager
router.post('/:id/block', adminOnly, checkPermission('Managers', 'block'), auditLog('Managers', 'BLOCK'), async (req, res) => {
  try {
    const existingManager = await BranchManager.findById(req.params.id);
    if (!existingManager) return res.status(404).json({ message: 'Manager not found' });
    if (!canAccessBranch(req.adminUser, existingManager.branchId)) {
      return res.status(403).json({ message: 'You cannot block this manager' });
    }

    const manager = await BranchManager.findByIdAndUpdate(req.params.id, { status: 'blocked' }, { new: true });
    res.json({ success: true, data: manager });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/managers/:id/unblock
// @desc    Unblock a manager
router.post('/:id/unblock', adminOnly, checkPermission('Managers', 'unblock'), auditLog('Managers', 'UNBLOCK'), async (req, res) => {
  try {
    const existingManager = await BranchManager.findById(req.params.id);
    if (!existingManager) return res.status(404).json({ message: 'Manager not found' });
    if (!canAccessBranch(req.adminUser, existingManager.branchId)) {
      return res.status(403).json({ message: 'You cannot unblock this manager' });
    }

    const manager = await BranchManager.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    res.json({ success: true, data: manager });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
