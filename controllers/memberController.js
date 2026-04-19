const ExtraMember = require('../models/ExtraMember');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const WalletTransaction = require('../models/WalletTransaction');
const mongoose = require('mongoose');
const { generateMemberPDF } = require('../utils/memberPdfGenerator');
const { generateMemberCode } = require('../utils/memberHelper');
const { emitMemberEvent } = require('../utils/socketService');
const { clearDashboardCache } = require('./reportController');
const { uploadBase64Image } = require('../services/s3Service');
const cacheService = require('../services/cacheService');

// @desc    Register a member
// @route   POST /api/members
// @access  Private/FieldVisitor
const registerMember = async (req, res, next) => {
    try {
        const fs = require('fs');
        fs.appendFileSync('debug_log.txt', `[registerMember] Start: ${new Date().toISOString()}, Payload: ${JSON.stringify({ ...req.body, signatureImage: req.body.signatureImage ? 'EXISTS' : 'NONE' })}\n`);
        let { name, address, mobile, email, nic, memberCode, registrationData, profileImage, memberType, registrationFeePaid, biometricData, signatureImage, idFrontImage, idBackImage, id: leadId } = req.body;
        const branchId = req.user?.branchId || 'default-branch';

        // Normalize data
        if (nic) nic = nic.trim().toUpperCase();
        if (mobile) mobile = mobile.replace(/\s+/g, '');

        // Validate required fields
        if (!name || !address || !mobile || !nic) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: name, address, mobile, nic'
            });
        }

        // Check duplicate
        const existingMember = await ExtraMember.findOne({ $or: [{ nic }, { mobile }] });
        if (existingMember && !leadId) {
            return res.status(409).json({
                success: false,
                message: 'Member already registered with this NIC or Mobile number',
                data: existingMember
            });
        }

        // Generate Custom Member ID
        let generatedMemberCode = memberCode;
        if (!generatedMemberCode) {
            generatedMemberCode = await generateMemberCode(branchId, req.user.role, req.user);
        }

        // 1. UPLOAD IMAGES IN PARALLEL (Once only)
        const [uploadedProfile, uploadedSignature, uploadedFront, uploadedBack] = await Promise.all([
            uploadBase64Image(profileImage, 'profile'),
            uploadBase64Image(signatureImage, 'signatures'),
            uploadBase64Image(idFrontImage, 'ids'),
            uploadBase64Image(idBackImage, 'ids')
        ]);

        let newMember;
        if (leadId) {
            newMember = await ExtraMember.findById(leadId);
        }

        if (newMember) {
            newMember.profileImage = uploadedProfile;
            newMember.signatureImage = uploadedSignature;
            newMember.idFrontImage = uploadedFront;
            newMember.idBackImage = uploadedBack;

            newMember.name = name;
            newMember.address = address;
            newMember.mobile = mobile;
            newMember.email = email;
            newMember.nic = nic;
            newMember.memberCode = generatedMemberCode;
            newMember.registrationData = registrationData;
            newMember.memberType = memberType;
            newMember.registrationFeePaid = registrationFeePaid;
            newMember.biometricData = biometricData;
            newMember.collectedAt = new Date();
            await newMember.save();
        }

        // Sync to central Member collection - skip for managers
        let savedMember = leadId ? await ExtraMember.findById(leadId) : null;
        if (req.user?.role !== 'manager') {
            try {
                const memberData = {
                    name,
                    address,
                    mobile,
                    email,
                    nic,
                    memberCode: generatedMemberCode,
                    fieldVisitorId: req.user?._id,
                    branchId,
                    area: req.user?.area || 'default-area',
                    registrationData,
                    registeredAt: new Date(),
                    profileImage: uploadedProfile,
                    memberType,
                    registrationFeePaid,
                    biometricData,
                    signatureImage: uploadedSignature,
                    idFrontImage: uploadedFront,
                    idBackImage: uploadedBack,
                    walletBalance: 0
                };
                savedMember = await Member.findOneAndUpdate(
                    { mobile: mobile },
                    memberData,
                    { upsert: true, new: true }
                );

                // --- Atomically Update Field Visitor Member/Lead Counts ---
                if (req.user && (req.user.role === 'field_visitor' || req.user.role === 'field')) {
                    const fvUpdate = { $inc: { memberCount: 1 } };
                    if (leadId) fvUpdate.$inc.leadCount = -1;
                    await FieldVisitor.findByIdAndUpdate(req.user._id, fvUpdate);
                }
            } catch (syncError) {
                console.error('[Sync] Error:', syncError);
                throw syncError;
            }
        }
 else {
            // For managers, if not already handled as lead, we might need a dummy savedMember object or handle response
            // But based on current logic, if a manager calls this (unauthorized), we don't save to Member.
            // If it was a lead (ExtraMember), it's already updated above.
            if (!savedMember) {
                // If it was not a lead and manager somehow accessed this, return early or handle as ExtraMember
                // Given the requirement, managers only save to ManagersMember, but this endpoint is for FieldVisitors (ExtraMember/Member)
                return res.status(403).json({ success: false, message: 'Managers should use the manager-specific registration endpoint' });
            }
        }

        // Generate PDF
        let pdfUrl = '';
        try {
            pdfUrl = await generateMemberPDF(savedMember);
            savedMember.pdfUrl = pdfUrl;
            await savedMember.save();
        } catch (pdfErr) {
            console.error('Member PDF Generation Error:', pdfErr);
            // Continue without PDF, don't fail registration
        }

        // CREATE PERSISTENT NOTIFICATION
        try {
            const { createAndSendNotification } = require('../utils/notificationHelper');
            await createAndSendNotification({
                title: `Member Registered: ${savedMember.name}`,
                body: `Registration completed successfully for ${savedMember.name}. PDF details are available for download.`,
                date: new Date(),
                attachment: pdfUrl, // Save PDF URL here
                memberId: savedMember._id,
                fieldVisitorId: req.user._id,
                userId: req.user._id, // Notify the Field Visitor who registered
                userRole: 'field_visitor',
                branchId: branchId
            });
        } catch (notifErr) {
            console.error('Notification Creation Error:', notifErr);
        }

        // EMIT REAL-TIME UPDATE (Targeted rooms to prevent cross-branch leakage)
        const fieldVisitorId = req.user._id;
        emitMemberEvent('memberCreated', savedMember, `visitor_${fieldVisitorId}`);
        emitMemberEvent('memberCreated', savedMember, `branch_${branchId}`);

        // CREDIT WALLET FOR FIELD VISITOR (Only for New Members)
        if (req.user && (req.user.role === 'field_visitor' || req.user.role === 'field') && memberType === 'New') {
            try {
                const fv = await FieldVisitor.findById(req.user._id);
                if (fv) {
                    const bonusAmount = 1000;
                    fv.walletBalance = (fv.walletBalance || 0) + bonusAmount;
                    await fv.save();

                    const walletTx = new WalletTransaction({
                        userId: fv._id,
                        userModel: 'FieldVisitor',
                        type: 'input', // Use 'input' for bonus/registration fee
                        amount: bonusAmount,
                        balanceAfter: fv.walletBalance,
                        reference: `Registration Fee: ${savedMember.name} (${savedMember.memberCode})`
                    });
                    await walletTx.save();

                    console.log(`[Wallet] Credited 1000 to FV ${fv.name} for member ${savedMember.name}`);
                }
            } catch (walletErr) {
                console.error('[Wallet] Bonus Credit Error:', walletErr);
                // Don't fail the whole registration if wallet credit fails, 
                // but log it prominently.
            }
        }

        // Clear dashboard and member caches to show the new member immediately
        clearDashboardCache();
        cacheService.delStartWith('members_');

        res.status(201).json({
            success: true,
            message: 'Member registered successfully',
            data: savedMember,
            pdfUrl
        });
    } catch (error) {
        console.error('Member Registration Error:', error);
        res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
};

// @desc    Get members
// @route   GET /api/members
// @access  Private
const getMembers = async (req, res) => {
    try {
        const { search, fieldVisitorId: queryFvId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const branchId = req.user?.branchId || 'default-branch';
        const userId = req.user?._id;
        const role = req.user?.role;
        const isManager = role && (role.toLowerCase() === 'manager' || role.toLowerCase() === 'branch manager');

        const cacheKey = `members_${role}_${userId}_${branchId}_${queryFvId || 'all'}_${search || 'none'}_p${page}_l${limit}`;
        const cached = cacheService.get(cacheKey);
        
        // Force refresh from DB if requested or troubleshooting
        const forceRefresh = req.query.refresh === 'true';

        if (cached && !forceRefresh) {
            console.log(`[getMembers] Serving from Cache: ${cacheKey}`);
            return res.json(cached);
        }

        const INSTANCE_ID = '[SVR-v2-SYNC]'; // Unique trace for this version
        console.log(`${INSTANCE_ID} [getMembers] Query: ${JSON.stringify(req.query)} | User: ${userId} (${role}) | Branch: ${branchId}`);

        let extraMatch = {};
        let memberMatch = {};

        if (isManager) {
            // Guard: only filter by FV if queryFvId is a valid non-empty ObjectId
            if (queryFvId && mongoose.Types.ObjectId.isValid(queryFvId)) {
                const fvOid = new mongoose.Types.ObjectId(queryFvId);
                // RELAXED: Prioritize the connection to the Field Visitor.
                // If Jhon is visible to the manager, all his members should be too.
                memberMatch = { fieldVisitorId: fvOid };
                extraMatch = { collectedBy: fvOid };

                console.log(`${INSTANCE_ID} [getMembers] Relaxed Branch filter for Jhon/FvId: ${queryFvId}`);
            } else {
                const visitors = await FieldVisitor.find({ branchId }).select('_id');
                const visitorIds = visitors.map(v => v._id);
                if (userId) visitorIds.push(new mongoose.Types.ObjectId(userId));

                extraMatch.collectedBy = { $in: visitorIds };
                memberMatch.fieldVisitorId = { $in: visitorIds };
            }
        } else {
            const userOid = new mongoose.Types.ObjectId(userId);
            extraMatch.collectedBy = userOid;
            memberMatch.fieldVisitorId = userOid;
        }

        // --- STRICT MEMBER FILTERING ---
        // Only include ExtraMember records that have been assigned a memberCode (meaning they are verified members)
        extraMatch.memberCode = { $ne: null, $ne: '' };
        // -------------------------------


        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const searchMatch = {
                $or: [
                    { name: searchRegex },
                    { mobile: searchRegex },
                    { nic: searchRegex },
                    { address: searchRegex }
                ]
            };
            extraMatch = { ...extraMatch, ...searchMatch };
            memberMatch = { ...memberMatch, ...searchMatch };
        }

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const fetchWithTxs = async (Model, match) => {
            return Model.aggregate([
                { $match: match },
                { $sort: { [Model.modelName === 'Member' ? 'registeredAt' : 'collectedAt']: -1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        profileImage: 0,
                        signatureImage: 0,
                        idFrontImage: 0,
                        idBackImage: 0,
                        biometricData: 0
                    }
                },
                {
                    $addFields: {
                        totalBuyAmount: { $ifNull: ["$totalBuyAmount", 0] },
                        totalSellAmount: { $ifNull: ["$totalSellAmount", 0] }
                    }
                }
            ]);
        };

        const [extraResults, memberResults, totalMembers, totalExtra] = await Promise.all([
            // Include Leads (ExtraMember) for both Managers and Field Visitors to ensure full visibility
            fetchWithTxs(ExtraMember, extraMatch),
            fetchWithTxs(Member, memberMatch),
            Member.countDocuments(memberMatch),
            ExtraMember.countDocuments(extraMatch)
        ]);

        const totalMatching = totalMembers + totalExtra;

        const mergedMap = new Map();

        const processResult = (m, isExtra) => {
            const totalBuyAmount = m.totalBuyAmount || 0;
            const totalSellAmount = m.totalSellAmount || 0;

            const mobile = m.mobile || '';
            const normalizedName = (m.name || '').trim().toLowerCase();

            // Strictly use the stored memberCode. If it's missing, it's a lead and shouldn't be in this list.
            const code = m.memberCode;
            if (isExtra && !code) {
                // This is a safety check: leads should already be filtered out by the aggregate match
                return;
            }

            // Use composite key to prevent merging different people with same mobile
            const key = `${mobile}|${normalizedName}`;

            if (!mergedMap.has(key)) {
                mergedMap.set(key, {
                    id: m._id.toString(),
                    _id: m._id,
                    name: m.name,
                    full_name: m.name,
                    mobile,
                    address: m.address,
                    postal_address: m.address,
                    nic: m.nic,
                    memberCode: code,
                    member_code: code,
                    fieldVisitorId: isExtra ? m.collectedBy : m.fieldVisitorId,
                    field_visitor_id: isExtra ? m.collectedBy : m.fieldVisitorId,
                    registeredAt: isExtra ? (m.collectedAt || m.createdAt) : m.registeredAt,
                    totalBuyAmount,
                    totalSellAmount,
                    email: m.email || '',
                    // Include full details for app & PDF generation
                    registrationData: m.registrationData,
                    signatureImage: m.signatureImage,
                    profileImage: m.profileImage,
                    memberType: m.memberType,
                    registrationFeePaid: m.registrationFeePaid,
                    biometricData: m.biometricData,
                    pdfUrl: m.pdfUrl
                });
            } else {
                const existing = mergedMap.get(key);
                existing.totalBuyAmount += totalBuyAmount;
                existing.totalSellAmount += totalSellAmount;
                if (!existing.memberCode && code) {
                    existing.memberCode = code;
                    existing.member_code = code;
                }
            }
        };

        extraResults.forEach(m => processResult(m, true));
        memberResults.forEach(m => processResult(m, false));

        const serverData = Array.from(mergedMap.values()).sort((a, b) =>
            new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0)
        );

        console.log(`[getMembers] Result Count: ${serverData.length} | Merged Results: ${serverData.length} | Branch: ${branchId}`);

        const responseData = { 
            success: true, 
            count: serverData.length,
            total: totalMatching,
            data: serverData,
            page,
            hasMore: serverData.length >= limit // Heuristic: if we reached the limit, there might be more
        };

        res.json(responseData);
        cacheService.set(cacheKey, responseData, 300);
    } catch (error) {
        console.error('[getMembers] Error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

// @desc    Update member
// @route   PUT /api/members/:id
// @access  Private
const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Try to find in ExtraMember (Leads) first, then Member
        let member = await ExtraMember.findById(id);
        let isExtra = true;

        if (!member) {
            member = await Member.findById(id);
            isExtra = false;
        }

        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

        if (updates.email !== undefined) member.email = updates.email;
        if (updates.mobile) member.mobile = updates.mobile;
        if (updates.name) member.name = updates.name;
        if (updates.address) member.address = updates.address;
        if (updates.nic) member.nic = updates.nic;
        if (updates.biometricData) member.biometricData = updates.biometricData;

        if (updates.profileImage) member.profileImage = await uploadBase64Image(updates.profileImage, 'profile');
        if (updates.signatureImage) member.signatureImage = await uploadBase64Image(updates.signatureImage, 'signatures');
        if (updates.idFrontImage) member.idFrontImage = await uploadBase64Image(updates.idFrontImage, 'ids');
        if (updates.idBackImage) member.idBackImage = await uploadBase64Image(updates.idBackImage, 'ids');

        if (updates.registrationData) member.registrationData = { ...member.registrationData, ...updates.registrationData };

        const updatedMember = await member.save();

        // EMIT REAL-TIME UPDATE (Targeted rooms)
        const branchId = updatedMember.branchId || 'default-branch';
        const fieldVisitorId = isExtra ? updatedMember.collectedBy : updatedMember.fieldVisitorId;
        
        if (fieldVisitorId) {
            emitMemberEvent('memberUpdated', updatedMember, `visitor_${fieldVisitorId}`);
        }
        emitMemberEvent('memberUpdated', updatedMember, `branch_${branchId}`);

        // Clear dashboard and member caches
        clearDashboardCache();
        cacheService.delStartWith('members_');

        res.json({ success: true, data: updated, message: 'Member updated successfully' });
    } catch (error) {
        console.error('Update Member Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update member', error: error.message });
    }
};

const generateMemberPdfEndpoint = async (req, res) => {
    try {
        const { id } = req.params;

        // Try ExtraMember (leads) then Member
        let member = await ExtraMember.findById(id);
        if (!member) {
            member = await Member.findById(id);
        }

        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        // ALWAYS REGENERATE: Apply template updates to existing records
        const pdfUrl = await generateMemberPDF(member);
        member.pdfUrl = pdfUrl;
        await member.save();

        res.json({ success: true, pdfUrl: member.pdfUrl });
    } catch (error) {
        console.error('Generate PDF Error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
};

module.exports = { registerMember, getMembers, updateMember, generateMemberPdfEndpoint };
