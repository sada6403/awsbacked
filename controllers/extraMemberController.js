const ExtraMember = require('../models/ExtraMember');
const translationService = require('../services/translationService');
const { clearDashboardCache } = require('./reportController');

// @desc    Add a new extra member (lead)
// @route   POST /api/extra-members
// @access  Private (Field Visitor)
exports.addExtraMember = async (req, res) => {
    try {
        let { name, address, mobile, email, nic, notes, fieldVisitorId, idFrontImage, idBackImage, profileImage } = req.body;

        if (!fieldVisitorId) {
            return res.status(400).json({ success: false, message: 'Field Visitor ID is required' });
        }

        // Normalize data
        if (nic) nic = nic.trim().toUpperCase();
        if (mobile) mobile = mobile.replace(/\s+/g, '');

        // Fetch FieldVisitor to get branch and area
        const FieldVisitor = require('../models/FieldVisitor');
        const visitor = await FieldVisitor.findById(fieldVisitorId);
        const branchId = visitor ? visitor.branchId : 'default-branch';
        const area = visitor ? visitor.area : 'default-area';

        // Translate notes to English if provided
        if (notes) {
            notes = await translationService.translateToEnglish(notes.trim());
        }

        // Check for existing extra member by NIC or Mobile
        const existingExtra = await ExtraMember.findOne({ $or: [{ nic }, { mobile }] });
        if (existingExtra) {
            return res.status(409).json({
                success: true, // We return true because the goal is achieved (member exists)
                message: 'Member already registered as a lead',
                data: existingExtra
            });
        }

        const newMember = await ExtraMember.create({
            name,
            address,
            mobile,
            email,
            nic,
            notes,
            idFrontImage,
            idBackImage,
            profileImage,
            branchId,
            area,
            collectedBy: fieldVisitorId,
            collectedAt: new Date()
        });

        // Clear dashboard cache if lead addition affects any counts
        clearDashboardCache();

        res.status(201).json({
            success: true,
            data: newMember
        });
    } catch (error) {
        console.error('Error adding extra member:', error);

        if (error.code === 11000) {
            console.error('Duplicate key error details:', error.keyValue);
            const field = Object.keys(error.keyValue)[0];
            return res.status(409).json({
                success: false,
                message: `Lead with this ${field} already exists`
            });
        }

        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }

};

// @desc    Get daily progress for a Field Visitor
// @route   GET /api/extra-members/progress/:fieldVisitorId
// @access  Private
exports.getDailyProgress = async (req, res) => {
    try {
        const { fieldVisitorId } = req.params;

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const count = await ExtraMember.countDocuments({
            collectedBy: fieldVisitorId,
            collectedAt: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        res.status(200).json({
            success: true,
            data: {
                count: count,
                target: 10,
                isCompleted: count >= 10
            }
        });
    } catch (error) {
        console.error('Error getting daily progress:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
// @desc    Get all extra members (leads)
// @route   GET /api/extra-members
// @access  Private
exports.getExtraMembers = async (req, res) => {
    try {
        const userId = req.user._id;
        const role = req.user.role;
        const branchId = req.user.branchId || 'default-branch';

        let query = {};
        if (role === 'manager') {
            const requestedVisitorId = req.query.fieldVisitorId;
            if (requestedVisitorId) {
                // Manager can filter by specific field visitor
                query = { collectedBy: requestedVisitorId };
            } else {
                // Manager sees all leads from their branch's FVs + themselves
                const FieldVisitor = require('../models/FieldVisitor');
                const visitors = await FieldVisitor.find({ branchId }).select('_id');
                const visitorIds = visitors.map(v => v._id);
                visitorIds.push(userId);
                query = { collectedBy: { $in: visitorIds } };
            }
        } else {
            // Field Visitor can only see their own leads
            query = { collectedBy: userId };
        }

        // Only show leads that HAVEN'T been registered (no memberCode)
        query.memberCode = { $exists: false };

        const members = await ExtraMember.find(query)
            .select('-profileImage -signatureImage -idFrontImage -idBackImage -biometricData')
            .sort({ collectedAt: -1 })
            .limit(100)
            .lean();

        // Map to legacy format for UI compatibility if needed
        const data = members.map(m => ({
            ...m,
            id: m._id,
            full_name: m.name,
            postal_address: m.address,
            memberCode: `E-${m.mobile.slice(-4)}`,
            member_code: `E-${m.mobile.slice(-4)}`
        }));

        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (error) {
        console.error('Error getting extra members:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};
