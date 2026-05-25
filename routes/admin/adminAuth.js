const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AdminUser = require('../../models/AdminUser');
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const { buildAdminProfile } = require('../../utils/adminAccess');

// @route   POST /api/admin/auth/login
// @desc    Authenticate admin user & get token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const adminUser = await AdminUser.findOne({ email });

    if (!adminUser) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (adminUser.status !== 'active') {
      return res.status(403).json({ message: 'Account is blocked' });
    }

    const isMatch = await bcrypt.compare(password, adminUser.passwordHash);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    adminUser.lastLoginAt = new Date();
    await adminUser.save();

    const payload = {
      id: adminUser.id,
      role: adminUser.role,
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secretOrPrivateKey',
      { expiresIn: '1d' },
      (err, token) => {
        if (err) throw err;
        buildAdminProfile(adminUser)
          .then((userProfile) => {
            res.json({
              token,
              user: userProfile,
            });
          })
          .catch((profileError) => {
            console.error('Admin Login Profile Error:', profileError.message);
            res.status(500).send('Server error');
          });
      }
    );
  } catch (err) {
    console.error('Admin Login Error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/admin/auth/logout
// @desc    Logout admin user
router.post('/logout', adminOnly, (req, res) => {
  // In a stateless JWT setup, logout is typically handled client-side by deleting the token.
  // We can just return success here.
  res.json({ message: 'Logged out successfully' });
});

// @route   GET /api/admin/auth/me
// @desc    Get current admin profile
router.get('/me', adminOnly, async (req, res) => {
  try {
    const adminUser = await AdminUser.findById(req.adminUser.id).select('-passwordHash');
    const userProfile = await buildAdminProfile(adminUser);
    res.json({ success: true, data: userProfile });
  } catch (err) {
    console.error('Auth Me Error:', err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/admin/auth/change-password
// @desc    Change admin password
router.post('/change-password', adminOnly, auditLog('Auth', 'CHANGE_PASSWORD'), async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const adminUser = await AdminUser.findById(req.adminUser.id);

    const isMatch = await bcrypt.compare(currentPassword, adminUser.passwordHash);

    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect current password' });
    }

    const salt = await bcrypt.genSalt(10);
    adminUser.passwordHash = await bcrypt.hash(newPassword, salt);
    await adminUser.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change Password Error:', err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
