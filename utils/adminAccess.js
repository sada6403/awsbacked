const SubAdminPermission = require('../models/SubAdminPermission');

function normalizeBranchId(branchId) {
  return String(branchId || '').trim();
}

async function getPermissionDoc(adminUserId) {
  return SubAdminPermission.findOne({ adminUserId }).lean();
}

async function buildAdminProfile(adminUser) {
  if (!adminUser) {
    return null;
  }

  const permissionDoc =
    adminUser.role === 'SuperAdmin' ? null : await getPermissionDoc(adminUser._id);

  return {
    id: String(adminUser._id),
    name: adminUser.name,
    email: adminUser.email,
    phone: adminUser.phone,
    role: adminUser.role,
    status: adminUser.status,
    assignedBranchIds: Array.isArray(adminUser.assignedBranchIds)
      ? adminUser.assignedBranchIds.map(normalizeBranchId).filter(Boolean)
      : [],
    permissions: permissionDoc?.permissions || [],
    lastLoginAt: adminUser.lastLoginAt,
    createdAt: adminUser.createdAt,
  };
}

function getAccessibleBranchIds(adminUser) {
  if (!adminUser || adminUser.role === 'SuperAdmin') {
    return [];
  }

  return Array.isArray(adminUser.assignedBranchIds)
    ? adminUser.assignedBranchIds.map(normalizeBranchId).filter(Boolean)
    : [];
}

function applyBranchScope(adminUser, baseQuery = {}, branchField = 'branchId') {
  const scopedQuery = { ...baseQuery };
  const branchIds = getAccessibleBranchIds(adminUser);

  if (branchIds.length > 0) {
    scopedQuery[branchField] = { $in: branchIds };
  }

  return scopedQuery;
}

function canAccessBranch(adminUser, branchId) {
  if (!adminUser || adminUser.role === 'SuperAdmin') {
    return true;
  }

  const normalized = normalizeBranchId(branchId);
  if (!normalized) {
    return false;
  }

  return getAccessibleBranchIds(adminUser).includes(normalized);
}

module.exports = {
  applyBranchScope,
  buildAdminProfile,
  canAccessBranch,
  getAccessibleBranchIds,
  normalizeBranchId,
};
