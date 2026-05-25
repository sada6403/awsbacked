const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const Attendance = require('../../models/Attendance');
const FieldVisitor = require('../../models/FieldVisitor');

// @route   GET /api/admin/geo-tracking
// @desc    Get latest locations of all field visitors
router.get('/', adminOnly, async (req, res) => {
  try {
    // Get all active field visitors
    const visitors = await FieldVisitor.find({ status: 'active' }).select('name userId branchId');
    
    // For each visitor, find their latest attendance with location
    const locations = await Promise.all(visitors.map(async (v) => {
      const latest = await Attendance.findOne({ userId: v._id, 'location.lat': { $ne: null } })
        .sort({ createdAt: -1 });
      
      return {
        visitorId: v._id,
        name: v.name,
        branchId: v.branchId,
        location: latest ? latest.location : null,
        lastActive: latest ? latest.updatedAt : null
      };
    }));

    res.json({ success: true, data: locations });
  } catch (error) {
    console.error('Geo Tracking Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
