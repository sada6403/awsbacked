const Branch = require('../models/Branch');
const { getAccessibleBranchIds, normalizeBranchId } = require('./adminAccess');
const { isOfficialBranchCode, normalizeBranchCode } = require('./branchMaster');

async function validateBranchCode(branchCode) {
  const normalizedCode = normalizeBranchCode(branchCode);
  if (!normalizedCode) {
    return null;
  }

  const branch = await Branch.findOne({ branchCode: normalizedCode }, 'branchCode branchName branchId').lean();
  if (!branch || !isOfficialBranchCode(branch.branchCode) || !branch.branchName) {
    return null;
  }
  return branch;
}

async function resolveRequestedBranchCodes(adminUser, query = {}) {
  const rawBranchCode = query.branchCode || query.branchId || query.branch;
  const normalizedRequestedCode = normalizeBranchCode(rawBranchCode);
  const allowedBranchCodes = getAccessibleBranchIds(adminUser).map(normalizeBranchId).filter(Boolean);
  const isSuperAdmin = !adminUser || adminUser.role === 'SuperAdmin';

  if (!normalizedRequestedCode) {
    return {
      requestedBranch: null,
      branchCodes: isSuperAdmin ? [] : allowedBranchCodes,
    };
  }

  const branch = await validateBranchCode(normalizedRequestedCode);
  if (!branch) {
    const error = new Error('Invalid Branch Code');
    error.statusCode = 400;
    throw error;
  }

  if (!isSuperAdmin && allowedBranchCodes.length > 0 && !allowedBranchCodes.includes(branch.branchCode)) {
    const error = new Error('You cannot access this branch');
    error.statusCode = 403;
    throw error;
  }

  return {
    requestedBranch: branch,
    branchCodes: [branch.branchCode],
  };
}

async function applyBranchFilters(adminUser, query = {}, baseQuery = {}, branchField = 'branchId') {
  const nextQuery = { ...baseQuery };
  const { branchCodes } = await resolveRequestedBranchCodes(adminUser, query);

  if (branchCodes.length > 0) {
    nextQuery[branchField] = { $in: branchCodes };
  }

  return nextQuery;
}

module.exports = {
  applyBranchFilters,
  resolveRequestedBranchCodes,
  validateBranchCode,
};
