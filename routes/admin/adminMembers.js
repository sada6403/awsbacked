const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Branch = require('../../models/Branch');
const Member = require('../../models/Member');
const { applyBranchScope, canAccessBranch } = require('../../utils/adminAccess');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');

// @route   GET /api/admin/members
// @desc    Get all members
router.get('/', adminOnly, checkPermission('Members', 'view'), async (req, res) => {
  try {
    const { status, fieldVisitorId, search } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');

    if (status) {
      query.status = String(status).trim().toLowerCase();
    }
    if (fieldVisitorId) {
      query.fieldVisitorId = fieldVisitorId;
    }
    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      query.$or = [{ name: pattern }, { mobile: pattern }, { nic: pattern }, { email: pattern }, { memberCode: pattern }];
    }

    const [members, total] = await Promise.all([
      Member.find(query)
        .select('-profileImage -signatureImage -idFrontImage -idBackImage')
        .populate('fieldVisitorId', 'name fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Member.countDocuments(query),
    ]);
    const branchCodes = [...new Set(members.map((member) => member.branchId).filter(Boolean))];
    const branches = await Branch.find({ branchCode: { $in: branchCodes } }, 'branchCode branchName').lean();
    const branchNameMap = new Map(branches.map((branch) => [branch.branchCode, branch.branchName]));

    res.json({
      success: true,
      data: members.map((member) => ({
        ...member.toObject(),
        branchName: branchNameMap.get(member.branchId) || member.branchId,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Fetch Members Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/members/:id
// @desc    Get single member
router.get('/:id', adminOnly, checkPermission('Members', 'view'), async (req, res) => {
  try {
    const member = await Member.findById(req.params.id)
      .populate('fieldVisitorId', 'name fullName');
    if (!member) return res.status(404).json({ message: 'Member not found' });
    if (!canAccessBranch(req.adminUser, member.branchId)) {
      return res.status(403).json({ message: 'You cannot view this member' });
    }
    const branch = await Branch.findOne({ branchCode: member.branchId }, 'branchCode branchName').lean();
    res.json({ success: true, data: { ...member.toObject(), branchName: branch?.branchName || member.branchId } });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/members
// @desc    Create a member
router.post('/', adminOnly, checkPermission('Members', 'create'), auditLog('Members', 'CREATE'), async (req, res) => {
  try {
    if (!canAccessBranch(req.adminUser, req.body.branchId)) {
      return res.status(403).json({ message: 'You cannot create members in this branch' });
    }

    const newMember = new Member(req.body);
    const savedMember = await newMember.save();
    res.status(201).json({ success: true, data: savedMember });
  } catch (error) {
    console.error('Create Member Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'NIC or Phone already exists' });
    }
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT /api/admin/members/:id
// @desc    Update a member
router.put('/:id', adminOnly, checkPermission('Members', 'edit'), auditLog('Members', 'UPDATE'), async (req, res) => {
  try {
    const existingMember = await Member.findById(req.params.id);
    if (!existingMember) return res.status(404).json({ message: 'Member not found' });
    if (!canAccessBranch(req.adminUser, existingMember.branchId)) {
      return res.status(403).json({ message: 'You cannot update this member' });
    }

    const updatedMember = await Member.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: updatedMember });
  } catch (error) {
    console.error('Update Member Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   DELETE /api/admin/members/:id
// @desc    Delete a member
router.delete('/:id', adminOnly, checkPermission('Members', 'delete'), auditLog('Members', 'DELETE'), async (req, res) => {
  try {
    const existingMember = await Member.findById(req.params.id);
    if (!existingMember) return res.status(404).json({ message: 'Member not found' });
    if (!canAccessBranch(req.adminUser, existingMember.branchId)) {
      return res.status(403).json({ message: 'You cannot delete this member' });
    }

    const deletedMember = await Member.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Delete Member Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/members/:id/block
// @desc    Block a member
router.post('/:id/block', adminOnly, checkPermission('Members', 'block'), auditLog('Members', 'BLOCK'), async (req, res) => {
  try {
    const existingMember = await Member.findById(req.params.id);
    if (!existingMember) return res.status(404).json({ message: 'Member not found' });
    if (!canAccessBranch(req.adminUser, existingMember.branchId)) {
      return res.status(403).json({ message: 'You cannot block this member' });
    }

    const member = await Member.findByIdAndUpdate(req.params.id, { status: 'blocked' }, { new: true });
    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   POST /api/admin/members/:id/unblock
// @desc    Unblock a member
router.post('/:id/unblock', adminOnly, checkPermission('Members', 'unblock'), auditLog('Members', 'UNBLOCK'), async (req, res) => {
  try {
    const existingMember = await Member.findById(req.params.id);
    if (!existingMember) return res.status(404).json({ message: 'Member not found' });
    if (!canAccessBranch(req.adminUser, existingMember.branchId)) {
      return res.status(403).json({ message: 'You cannot unblock this member' });
    }

    const member = await Member.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    res.json({ success: true, data: member });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

module.exports = router;
