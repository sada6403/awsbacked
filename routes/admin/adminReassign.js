const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const Member = require('../../models/Member');
const ExtraMember = require('../../models/ExtraMember');
const ManagersMember = require('../../models/ManagersMember');
const mongoose = require('mongoose');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');

// GET /api/admin/reassign/managers — list active managers only
router.get('/managers', adminOnly, async (req, res) => {
  try {
    const query = await applyBranchFilters(req.adminUser, req.query, { status: 'active' }, 'branchId');
    const managers = await BranchManager.find(query, 'fullName name userId branchId phone status').sort({ branchId: 1, fullName: 1 }).lean();
    res.json({ success: true, data: managers.map((m) => ({ _id: m._id, name: m.fullName || m.name, userId: m.userId, branchId: m.branchId, phone: m.phone, status: m.status })) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/reassign/field-visitors — list active field visitors only
router.get('/field-visitors', adminOnly, async (req, res) => {
  try {
    const query = await applyBranchFilters(req.adminUser, req.query, { status: 'active' }, 'branchId');
    const visitors = await FieldVisitor.find(query, 'fullName name userId branchId managerId phone status').sort({ branchId: 1, fullName: 1 }).lean();
    res.json({ success: true, data: visitors.map((v) => ({ _id: v._id, name: v.fullName || v.name, userId: v.userId, branchId: v.branchId, managerId: v.managerId, phone: v.phone, status: v.status })) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/reassign/manager-preview/:id — counts under a manager
router.get('/manager-preview/:id', adminOnly, async (req, res) => {
  try {
    const managerId = new mongoose.Types.ObjectId(req.params.id);
    const [fieldVisitors, managerMembers] = await Promise.all([
      FieldVisitor.find({ managerId }, 'fullName name userId branchId status').lean(),
      ManagersMember.find({ addedBy: managerId }, 'name memberCode branchId').lean(),
    ]);
    res.json({
      success: true,
      data: {
        fieldVisitorCount: fieldVisitors.length,
        managerMemberCount: managerMembers.length,
        fieldVisitors: fieldVisitors.map((v) => ({ _id: v._id, name: v.fullName || v.name, userId: v.userId, branchId: v.branchId, status: v.status })),
        managerMembers: managerMembers.slice(0, 10).map((m) => ({ _id: m._id, name: m.name, memberCode: m.memberCode, branchId: m.branchId })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/reassign/field-visitor-preview/:id — counts under a field visitor
router.get('/field-visitor-preview/:id', adminOnly, async (req, res) => {
  try {
    const visitorId = new mongoose.Types.ObjectId(req.params.id);
    const [members, leads] = await Promise.all([
      Member.find({ fieldVisitorId: visitorId }, 'name memberCode branchId status').lean(),
      ExtraMember.find({ collectedBy: visitorId }, 'name memberCode branchId').lean(),
    ]);
    res.json({
      success: true,
      data: {
        memberCount: members.length,
        leadCount: leads.length,
        members: members.slice(0, 10).map((m) => ({ _id: m._id, name: m.name, memberCode: m.memberCode, branchId: m.branchId, status: m.status })),
        leads: leads.slice(0, 10).map((l) => ({ _id: l._id, name: l.name, memberCode: l.memberCode, branchId: l.branchId })),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/reassign/manager — reassign FVs + manager members, then deactivate leaving manager
router.post('/manager', adminOnly, checkPermission('Managers', 'edit'), async (req, res) => {
  try {
    const { fromManagerId, toManagerId } = req.body;
    if (!fromManagerId || !toManagerId) return res.status(400).json({ message: 'fromManagerId and toManagerId are required' });
    if (String(fromManagerId) === String(toManagerId)) return res.status(400).json({ message: 'Source and target manager must be different' });

    const fromId = new mongoose.Types.ObjectId(fromManagerId);
    const toId = new mongoose.Types.ObjectId(toManagerId);

    const deactivatedAt = new Date();
    const [fvResult, mmResult] = await Promise.all([
      FieldVisitor.updateMany({ managerId: fromId }, { $set: { managerId: toId } }),
      ManagersMember.updateMany({ addedBy: fromId }, { $set: { addedBy: toId } }),
      BranchManager.findByIdAndUpdate(fromId, { $set: { status: 'inactive', deactivatedAt } }),
    ]);

    res.json({
      success: true,
      message: `Reassigned ${fvResult.modifiedCount} field visitor(s) and ${mmResult.modifiedCount} manager member(s). Manager deactivated.`,
      data: {
        fieldVisitorsReassigned: fvResult.modifiedCount,
        managerMembersReassigned: mmResult.modifiedCount,
        deactivatedAt: deactivatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/reassign/field-visitor — reassign members + leads, then deactivate leaving visitor
router.post('/field-visitor', adminOnly, checkPermission('Field Visitors', 'edit'), async (req, res) => {
  try {
    const { fromVisitorId, toVisitorId } = req.body;
    if (!fromVisitorId || !toVisitorId) return res.status(400).json({ message: 'fromVisitorId and toVisitorId are required' });
    if (String(fromVisitorId) === String(toVisitorId)) return res.status(400).json({ message: 'Source and target field visitor must be different' });

    const fromId = new mongoose.Types.ObjectId(fromVisitorId);
    const toId = new mongoose.Types.ObjectId(toVisitorId);

    const deactivatedAt = new Date();
    const [memberResult, leadResult] = await Promise.all([
      Member.updateMany({ fieldVisitorId: fromId }, { $set: { fieldVisitorId: toId } }),
      ExtraMember.updateMany({ collectedBy: fromId }, { $set: { collectedBy: toId } }),
      FieldVisitor.findByIdAndUpdate(fromId, { $set: { status: 'inactive', deactivatedAt } }),
    ]);

    res.json({
      success: true,
      message: `Reassigned ${memberResult.modifiedCount} member(s) and ${leadResult.modifiedCount} lead(s). Field visitor deactivated.`,
      data: {
        membersReassigned: memberResult.modifiedCount,
        leadsReassigned: leadResult.modifiedCount,
        deactivatedAt: deactivatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
