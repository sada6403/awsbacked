const ExtraMember = require('../models/ExtraMember');
const Member = require('../models/Member');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const mongoose = require('mongoose');
const { generateMemberPDF } = require('../utils/memberPdfGenerator');

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
            let branchCode = 'XX';
            let branchNameStr = '';

            if (req.user.role === 'manager') {
                branchNameStr = req.user.branchName;
            } else {
                const branchManager = await BranchManager.findOne({ branchId });
                if (branchManager) {
                    branchNameStr = branchManager.branchName;
                }


                if (branchNameStr) {
                    const nameUpper = branchNameStr.toUpperCase();
                    if (nameUpper.includes('KALMUNAI')) branchCode = 'KA';
                    else if (nameUpper.includes('TRINCO')) branchCode = 'TR';
                    else if (nameUpper.includes('KONDAVIL')) branchCode = 'JK';
                    else if (nameUpper.includes('SAVAGACHERI') || nameUpper.includes('CHAVAKACHCHERI')) branchCode = 'JS';
                    else branchCode = nameUpper.substring(0, 2);
                }

                const prefix = `FA${branchCode}`;
                const lastMember = await ExtraMember.findOne({
                    memberCode: { $regex: `^${prefix}\\d+$` }
                })
                    .sort({ memberCode: -1 })
                    .collation({ locale: "en", numericOrdering: true });

                let sequence = 1;
                if (lastMember && lastMember.memberCode) {
                    const lastSeqStr = lastMember.memberCode.replace(prefix, '');
                    const lastSeq = parseInt(lastSeqStr, 10);
                    if (!isNaN(lastSeq)) {
                        sequence = lastSeq + 1;
                    }
                }
                generatedMemberCode = `${prefix}${sequence.toString().padStart(3, '0')}`;
            }

            let newMember;
            if (leadId) {
                newMember = await ExtraMember.findById(leadId);
            }

            if (newMember) {
                newMember.name = name;
                newMember.address = address;
                newMember.mobile = mobile;
                newMember.email = email;
                newMember.nic = nic;
                newMember.memberCode = generatedMemberCode;
                newMember.registrationData = registrationData;
                newMember.profileImage = profileImage;
                newMember.memberType = memberType;
                newMember.registrationFeePaid = registrationFeePaid;
                newMember.biometricData = biometricData;
                newMember.signatureImage = signatureImage;
                newMember.idFrontImage = idFrontImage;
                newMember.idBackImage = idBackImage;
                newMember.collectedAt = new Date();
                await newMember.save(); // Only save to ExtraMember if it was already a lead
            }

            // Sync to central Member collection - ALWAYS do this
            let savedMember; // This will hold the data to return
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
                    profileImage,
                    memberType,
                    registrationFeePaid,
                    biometricData,
                    signatureImage,
                    idFrontImage,
                    idBackImage,
                    walletBalance: 0
                };
                savedMember = await Member.findOneAndUpdate(
                    { mobile: mobile },
                    memberData,
                    { upsert: true, new: true }
                );
            } catch (syncError) {
                console.error('[Sync] Error:', syncError);
                throw syncError; // Fail if central sync fails
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
                    body: 'Registration completed successfully.',
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

            res.status(201).json({
                success: true,
                created: true,
                message: 'Member registered successfully',
                data: savedMember,
                pdfUrl
            });
        } catch (error) {
            console.error('Member Registration Error:', error);

            // Duplicate key error
            if (error.code === 11000 || error.code === 11001) {
                const field = Object.keys(error.keyPattern || {})[0] || 'data';

                // For older APKs, we might want to return 200 OK with the existing member
                // Search for the existing member by NIC or Mobile
                const { nic, mobile } = req.body;
                const existing = await Member.findOne({ $or: [{ nic }, { mobile }] });

                if (existing) {
                    console.log(`[registerMember] Duplicate ${field} detected. Returning existing member.`);
                    return res.status(200).json({
                        success: true,
                        created: false,
                        message: `Member with this ${field} already exists`,
                        data: existing
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: `Member with this ${field} already exists`
                });
            }

            // Mongoose validation error
            if (error.name === 'ValidationError') {
                const messages = Object.values(error.errors).map(val => val.message);
                return res.status(400).json({
                    success: false,
                    message: messages.join(', ')
                });
            }

            // General server error
            res.status(500).json({
                success: false,
                message: 'Registration failed',
                error: error.message
            });
        }
    };

    // @desc    Get members
    // @route   GET /api/members
    // @access  Private
    const getMembers = async (req, res) => {
        try {
            const { search, fieldVisitorId: queryFvId } = req.query;
            const branchId = req.user?.branchId || 'default-branch';
            const userId = req.user?._id;
            const role = req.user?.role;

            let extraMatch = {};
            let memberMatch = {};

            if (role === 'manager') {
                if (queryFvId) {
                    const fvOid = new mongoose.Types.ObjectId(queryFvId);
                    extraMatch.collectedBy = fvOid;
                    memberMatch.fieldVisitorId = fvOid;
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
                    {
                        $lookup: {
                            from: 'transactions',
                            localField: '_id',
                            foreignField: 'memberId',
                            as: 'txs'
                        }
                    }
                ]);
            };

            const [extraResults, memberResults] = await Promise.all([
                (role === 'manager' && queryFvId) ? [] : fetchWithTxs(ExtraMember, extraMatch),
                fetchWithTxs(Member, memberMatch)
            ]);

            const mergedMap = new Map();

            const processResult = (m, isExtra) => {
                let totalBuyAmount = 0;
                let totalSellAmount = 0;

                if (m.txs && Array.isArray(m.txs)) {
                    m.txs.forEach(t => {
                        // SWITCH TO LIFETIME TOTALS: valid transaction is all that matters
                        if (t.type === 'buy') totalBuyAmount += (t.totalAmount || 0);
                        if (t.type === 'sell') totalSellAmount += (t.totalAmount || 0);
                    });
                }

                const mobile = m.mobile || '';
                const normalizedName = (m.name || '').trim().toLowerCase();
                // Robust member code generation: Use existing, or generate from mobile, or fallback to random
                const code = m.memberCode || (isExtra ? `L-${mobile.slice(-4)}` : `M-${mobile.slice(-4)}`);

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

            const data = Array.from(mergedMap.values()).sort((a, b) =>
                new Date(b.registeredAt || 0) - new Date(a.registeredAt || 0)
            );

            // DEBUG LOGGING
            const fs = require('fs');
            const debugOutput = data.map(m => `Name: ${m.name}, Sig: ${m.signatureImage ? m.signatureImage.length : 'NULL'}, RegData: ${m.registrationData ? Object.keys(m.registrationData) : 'NULL'}`).join('\n');
            fs.appendFileSync('debug_members.txt', `[${new Date().toISOString()}]\n${debugOutput}\n\n`);

            res.json({ success: true, count: data.length, data });
        } catch (error) {
            console.error('[getMembers] Error:', error);
            res.status(500).json({ success: false, message: 'Server Error', error: error.message, stack: error.stack });
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
            if (updates.signatureImage) member.signatureImage = updates.signatureImage;
            if (updates.registrationData) member.registrationData = { ...member.registrationData, ...updates.registrationData };

            const updatedMember = await member.save();

            // If it's a registered member, we might need to sync back to Member if we updated ExtraMember?
            // Actually, the app usually updates via ID. 
            // If it was ExtraMember, it stays there. 
            // If it was Member, it stays there.

            res.json({ success: true, data: updatedMember, message: 'Member updated successfully' });
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
