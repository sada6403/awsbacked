const Branch = require('../models/Branch');
const { resolveOfficialBranch } = require('./branchMaster');

/**
 * Builds a Map<branchCode, branchName> for the given list of raw branch codes/IDs.
 * Handles legacy IDs (e.g. "BR-KA-002") via resolveOfficialBranch, and always
 * prefers the official branch name over whatever is stored in the Branch collection.
 */
async function buildBranchNameMap(branchCodes) {
  const filtered = branchCodes.filter(Boolean);
  if (!filtered.length) return new Map();

  const officialMap = new Map(filtered.map((code) => [code, resolveOfficialBranch(code)]));
  const canonicalCodes = [...new Set(filtered.map((code) => officialMap.get(code)?.branchCode ?? code))];

  const dbBranches = await Branch.find({ branchCode: { $in: canonicalCodes } }, 'branchCode branchName').lean();
  const dbMap = new Map(dbBranches.map((b) => [b.branchCode, b.branchName]));

  const result = new Map();
  filtered.forEach((code) => {
    const official = officialMap.get(code);
    result.set(code, official?.branchName ?? dbMap.get(official?.branchCode ?? code) ?? code);
  });
  return result;
}

module.exports = { buildBranchNameMap };
