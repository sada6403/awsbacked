const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const Attendance = require('../../models/Attendance');

// @route   GET /api/admin/attendance
// @desc    Get attendance records
router.get('/', adminOnly, checkPermission('Attendance', 'view'), async (req, res) => {
  try {
    const { date, branch, userId } = req.query;
    
    let query = {};
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0,0,0,0);
      const endDate = new Date(date);
      endDate.setHours(23,59,59,999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    if (branch) query.branch = branch;
    if (userId) query.userId = userId;

    const records = await Attendance.find(query)
      .populate('userId', 'name role')
      .populate('branch', 'name')
      .sort({ date: -1 });

    res.json({ success: true, data: records });
  } catch (error) {
    console.error('Fetch Attendance Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
