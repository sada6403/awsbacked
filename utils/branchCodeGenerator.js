const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');

/**
 * Generate unique branch code from name with collision detection
 * Tries 2 letters first, then 3, then 4 if collisions exist
 * 
 * @param {String} name - Manager or branch name
 * @param {String} role - 'manager' or 'field_visitor' 
 * @returns {Promise<String>} - Unique branch code (2-4 letters uppercase)
 */
async function generateUniqueBranchCode(name, role = 'manager') {
    if (!name || typeof name !== 'string') {
        throw new Error('Name is required for branch code generation');
    }

    // Clean and uppercase the name
    const cleanName = name.trim().toUpperCase().replace(/[^A-Z]/g, '');

    if (cleanName.length < 2) {
        throw new Error('Name must contain at least 2 letters');
    }

    // Try with increasing letter counts: 2, 3, 4
    for (let letterCount = 2; letterCount <= 4; letterCount++) {
        const branchCode = cleanName.substring(0, letterCount);

        // Check if this branch code is already in use
        const isUsed = await isBranchCodeInUse(branchCode, role);

        if (!isUsed) {
            return branchCode;
        }
    }

    // If all attempts fail (very rare), use first 4 letters + random digit
    const fallbackCode = cleanName.substring(0, 4) + Math.floor(Math.random() * 10);
    console.warn(`Branch code collision for name "${name}", using fallback: ${fallbackCode}`);
    return fallbackCode;
}

/**
 * Check if a branch code is already in use
 * 
 * @param {String} branchCode - The branch code to check
 * @param {String} role - 'manager' or 'field_visitor'
 * @returns {Promise<Boolean>} - True if code is in use, false otherwise
 */
async function isBranchCodeInUse(branchCode, role) {
    // For managers, check if any manager userId contains this pattern
    // Format: BM-{BranchCode}-XXX
    const managerPattern = new RegExp(`^BM-${branchCode}-\\d{3}$`);
    const managerExists = await BranchManager.findOne({
        userId: { $regex: managerPattern }
    });

    if (managerExists) {
        return true;
    }

    // For field visitors, check if any FV userId contains this pattern
    // Format: FV-{BranchCode}-XXX
    const fvPattern = new RegExp(`^FV-${branchCode}-\\d{3}$`);
    const fvExists = await FieldVisitor.findOne({
        userId: { $regex: fvPattern }
    });

    if (fvExists) {
        return true;
    }

    return false;
}

/**
 * Generate next sequence number for a given branch code
 * 
 * @param {String} branchCode - The branch code
 * @param {String} prefix - 'MGR' or 'FV'
 * @returns {Promise<String>} - Sequence number as 3-digit string (e.g., '001', '002')
 */
async function getNextSequence(branchCode, prefix) {
    const Model = (prefix === 'MGR' || prefix === 'BM') ? BranchManager : FieldVisitor;
    const pattern = new RegExp(`^${prefix}-${branchCode}-\\d{3}$`);

    const count = await Model.countDocuments({
        userId: { $regex: pattern }
    });

    return (count + 1).toString().padStart(3, '0');
}

module.exports = {
    generateUniqueBranchCode,
    isBranchCodeInUse,
    getNextSequence
};
