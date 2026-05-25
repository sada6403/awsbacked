const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const AdminUser = require('../../models/AdminUser');
const SubAdminPermission = require('../../models/SubAdminPermission');
const bcrypt = require('bcryptjs');
const { buildAdminProfile } = require('../../utils/adminAccess');

// @route   GET /api/admin/sub-admins
// @desc    Get all sub-admin users
router.get('/', adminOnly, checkPermission('Sub Admin Users', 'view'), async (req, res) => {
  try {
    const query = { role: 'SubAdmin' };
    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search).trim(), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
    }

    const subAdmins = await AdminUser.find(query)
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    const users = await Promise.all(subAdmins.map((adminUser) => buildAdminProfile(adminUser)));
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Fetch Sub Admins Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/sub-admins
// @desc    Create a new sub-admin user
router.post('/', adminOnly, checkPermission('Sub Admin Users', 'create'), auditLog('Sub Admin Users', 'CREATE'), async (req, res) => {
  try {
    const { name, email, phone, password, assignedBranchIds = [], permissions = [] } = req.body;
    
    const existingUser = await AdminUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new AdminUser({
      name,
      email,
      phone,
      passwordHash,
      role: 'SubAdmin',
      assignedBranchIds,
      createdBy: req.adminUser.id
    });

    const savedUser = await newUser.save();
    await SubAdminPermission.findOneAndUpdate(
      { adminUserId: savedUser._id },
      { adminUserId: savedUser._id, permissions, updatedBy: req.adminUser._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const profile = await buildAdminProfile(savedUser);
    res.status(201).json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/sub-admins/:id
// @desc    Update sub-admin details
router.put('/:id', adminOnly, checkPermission('Sub Admin Users', 'edit'), auditLog('Sub Admin Users', 'UPDATE'), async (req, res) => {
  try {
    const { name, phone, password, assignedBranchIds } = req.body;
    const updateData = { name, phone };

    if (Array.isArray(assignedBranchIds)) {
      updateData.assignedBranchIds = assignedBranchIds;
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    updateData.updatedBy = req.adminUser.id;

    const updatedUser = await AdminUser.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-passwordHash');
    if (!updatedUser) return res.status(404).json({ message: 'Sub Admin not found' });
    
    const profile = await buildAdminProfile(updatedUser);
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/sub-admins/:id/block
// @desc    Block a sub-admin
router.post('/:id/block', adminOnly, checkPermission('Sub Admin Users', 'block'), auditLog('Sub Admin Users', 'BLOCK'), async (req, res) => {
  try {
    const user = await AdminUser.findByIdAndUpdate(req.params.id, { status: 'blocked' }, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/sub-admins/:id/unblock
// @desc    Unblock a sub-admin
router.post('/:id/unblock', adminOnly, checkPermission('Sub Admin Users', 'unblock'), auditLog('Sub Admin Users', 'UNBLOCK'), async (req, res) => {
  try {
    const user = await AdminUser.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/sub-admins/:id/permissions
// @desc    Update permissions for a sub-admin
router.put('/:id/permissions', adminOnly, checkPermission('Roles & Permissions', 'edit'), auditLog('Permissions', 'UPDATE'), async (req, res) => {
  try {
    const { permissions } = req.body; // Array of permission objects

    const savedPermissions = await SubAdminPermission.findOneAndUpdate(
      { adminUserId: req.params.id },
      { adminUserId: req.params.id, permissions: Array.isArray(permissions) ? permissions : [], updatedBy: req.adminUser._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, data: savedPermissions.permissions });
  } catch (error) {
    console.error('Update Permissions Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/sub-admins/:id
// @desc    Delete a sub-admin user
router.delete('/:id', adminOnly, checkPermission('Sub Admin Users', 'delete'), auditLog('Sub Admin Users', 'DELETE'), async (req, res) => {
  try {
    const user = await AdminUser.findOne({ _id: req.params.id, role: 'SubAdmin' });
    if (!user) {
      return res.status(404).json({ message: 'Sub Admin not found' });
    }

    await SubAdminPermission.deleteOne({ adminUserId: user._id });
    await AdminUser.deleteOne({ _id: user._id });

    res.json({ success: true, message: 'Sub Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
