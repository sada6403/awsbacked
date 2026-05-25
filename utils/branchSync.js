const Branch = require('../models/Branch');
const BranchManager = require('../models/BranchManager');
const {
  buildBranchId,
  normalizeBranchCode,
  resolveOfficialBranch,
} = require('./branchMaster');

async function syncBranchesFromManagers() {
  const managers = await BranchManager.find(
    { branchId: { $exists: true, $ne: null } },
    'branchId branchName'
  ).lean();

  const managerBranches = new Map();
  for (const manager of managers) {
    const officialBranch = resolveOfficialBranch(manager.branchId, manager.branchName);
    if (!officialBranch || managerBranches.has(officialBranch.branchCode)) continue;

    managerBranches.set(officialBranch.branchCode, {
      branchName: officialBranch.branchName,
      branchCode: officialBranch.branchCode,
      branchId: officialBranch.branchId || buildBranchId(officialBranch.branchCode),
      status: 'active',
    });
  }

  if (!managerBranches.size) return [];

  const createdBranches = [];

  for (const branch of managerBranches.values()) {
    const existingBranch = await Branch.findOne({
      $or: [
        { branchCode: branch.branchCode },
        { branchId: branch.branchId },
      ],
    });

    if (existingBranch) {
      existingBranch.branchName = branch.branchName;
      existingBranch.branchCode = branch.branchCode;
      existingBranch.branchId = branch.branchId;
      existingBranch.status = existingBranch.status || branch.status;
      await existingBranch.save();
      continue;
    }

    const createdBranch = await new Branch(branch).save();
    createdBranches.push(createdBranch.toObject());
  }

  return createdBranches;
}

module.exports = {
  syncBranchesFromManagers,
};
