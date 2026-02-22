const ExtraMember = require('../models/ExtraMember');
const Member = require('../models/Member');
const BranchManager = require('../models/BranchManager');

/**
 * Generates a custom member code based on the branch name.
 * Format: FA[BranchCode][Sequence] (e.g., FAKA001)
 */
async function generateMemberCode(branchId, userRole, userData) {
    let branchCode = 'XX';
    let branchNameStr = '';

    if (userRole === 'manager') {
        branchNameStr = userData.branchName;
    } else {
        const branchManager = await BranchManager.findOne({ branchId });
        if (branchManager) {
            branchNameStr = branchManager.branchName;
        }
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

    return `${prefix}${sequence.toString().padStart(3, '0')}`;
}

/**
 * Synchronizes an ExtraMember (lead) to the central Member collection.
 */
async function syncToCentralMembers(savedMember) {
    try {
        const memberData = {
            _id: savedMember._id,
            name: savedMember.name,
            address: savedMember.address,
            mobile: savedMember.mobile,
            email: savedMember.email,
            nic: savedMember.nic,
            memberCode: savedMember.memberCode,
            branchId: savedMember.branchId,
            area: savedMember.area || (savedMember.collectedBy ? 'Field-Operation' : 'Manager-Office'),
            registeredAt: savedMember.collectedAt || new Date(),
            idFrontImage: savedMember.idFrontImage,
            idBackImage: savedMember.idBackImage,
            profileImage: savedMember.profileImage,
            signatureImage: savedMember.signatureImage,
            registrationData: savedMember.registrationData,
            walletBalance: savedMember.walletBalance || 0,
        };

        // If it looks like a Manager registration (no fieldVisitorId)
        if (savedMember.collectedBy) {
            // Check if collectedBy refers to FieldVisitor or BranchManager
            // In ExtraMember, collectedBy is ref: FieldVisitor. 
            // However, managersMemberController uses Manager's ID.
            // In Member schema, fieldVisitorId is ref: FieldVisitor.
            // We only set fieldVisitorId if it's actually a FieldVisitor.
            const fieldVisitor = await FieldVisitor.findById(savedMember.collectedBy);
            if (fieldVisitor) {
                memberData.fieldVisitorId = savedMember.collectedBy;
            }
        }

        const savedMemberDoc = await Member.findOneAndUpdate(
            { mobile: savedMember.mobile },
            memberData,
            { upsert: true, new: true }
        );
        console.log(`[Sync] Member ${savedMember.mobile} synced successfully.`);
        return savedMemberDoc;
    } catch (syncError) {
        console.error('[Sync] Error:', syncError);
        throw syncError;
    }
}

// We need FieldVisitor here but to avoid circular dependencies if any, we require it inside sync
const FieldVisitor = require('../models/FieldVisitor');

module.exports = {
    generateMemberCode,
    syncToCentralMembers
};
