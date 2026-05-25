const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const SystemSetting = require('../../models/SystemSetting');
const AdminUser = require('../../models/AdminUser');

router.get('/', adminOnly, checkPermission('Settings', 'view'), async (req, res) => {
  try {
    const settings = await SystemSetting.findOne();
    res.json({ success: true, data: settings || {} });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

router.put('/', adminOnly, checkPermission('Settings', 'edit'), auditLog('Settings', 'UPDATE'), async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    const payload = req.body;
    if (settings) {
      settings = await SystemSetting.findByIdAndUpdate(settings._id, payload, { new: true, runValidators: true });
    } else {
      settings = await SystemSetting.create(payload);
    }
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server Error' });
  }
});

router.put('/profile', adminOnly, checkPermission('Settings', 'edit'), auditLog('Settings', 'PROFILE_UPDATE'), async (req, res) => {
  try {
    const updatedUser = await AdminUser.findByIdAndUpdate(
      req.adminUser._id,
      {
        name: req.body.name || req.adminUser.name,
        phone: req.body.phone || req.adminUser.phone,
      },
      { new: true }
    ).select('-passwordHash');
    res.json({ success: true, data: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server Error' });
  }
});

router.put('/password', adminOnly, checkPermission('Settings', 'edit'), auditLog('Settings', 'PASSWORD_UPDATE'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Current password and a valid new password are required' });
    }
    const adminUser = await AdminUser.findById(req.adminUser._id);
    if (!adminUser) {
      return res.status(404).json({ message: 'Admin user not found' });
    }
    const isMatch = await bcrypt.compare(currentPassword, adminUser.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    const salt = await bcrypt.genSalt(10);
    adminUser.passwordHash = await bcrypt.hash(newPassword, salt);
    await adminUser.save();
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
