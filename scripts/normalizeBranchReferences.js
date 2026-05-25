require('dotenv').config();

const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const Member = require('../models/Member');
const Transaction = require('../models/Transaction');
const BranchProduct = require('../models/BranchProduct');
const CompanyTransfer = require('../models/CompanyTransfer');
const { OFFICIAL_BRANCHES } = require('../utils/branchMaster');
const { syncBranchesFromManagers } = require('../utils/branchSync');

const LEGACY_TO_CODE = {
  'BR-AK-001': 'AP',
  'BR-PO-001': 'PL',
  'BR-PU-001': 'PK',
  'BR-TH-001': 'TP',
  'JF-CV-001': 'JS',
  KA001: 'KA',
};

for (const branch of OFFICIAL_BRANCHES) {
  LEGACY_TO_CODE[branch.branchCode] = branch.branchCode;
  LEGACY_TO_CODE[branch.branchId] = branch.branchCode;
}

const CODE_TO_BRANCH = new Map(OFFICIAL_BRANCHES.map((branch) => [branch.branchCode, branch]));

async function updateMany(Model, filter, update) {
  const result = await Model.updateMany(filter, update);
  return result.modifiedCount || 0;
}

async function normalizeBranchIdModel(Model, label, includeBranchName = false) {
  let updated = 0;

  for (const [legacyValue, branchCode] of Object.entries(LEGACY_TO_CODE)) {
    if (legacyValue === branchCode) continue;
    const branch = CODE_TO_BRANCH.get(branchCode);
    if (!branch) continue;

    const update = { branchId: branch.branchCode };
    if (includeBranchName) update.branchName = branch.branchName;
    updated += await updateMany(Model, { branchId: legacyValue }, { $set: update });
  }

  return { label, updated };
}

async function normalizeBranchProducts() {
  let updated = 0;

  for (const [legacyValue, branchCode] of Object.entries(LEGACY_TO_CODE)) {
    const branch = CODE_TO_BRANCH.get(branchCode);
    if (!branch) continue;

    updated += await updateMany(
      BranchProduct,
      { $or: [{ branchCode: legacyValue }, { branchId: legacyValue }] },
      { $set: { branchCode: branch.branchCode, branchId: branch.branchId } }
    );
  }

  return { label: 'BranchProduct', updated };
}

async function normalizeCompanyTransfers() {
  let updated = 0;

  for (const [legacyValue, branchCode] of Object.entries(LEGACY_TO_CODE)) {
    const branch = CODE_TO_BRANCH.get(branchCode);
    if (!branch) continue;

    updated += await updateMany(
      CompanyTransfer,
      { $or: [{ branchCode: legacyValue }, { branchId: legacyValue }] },
      { $set: { branchCode: branch.branchCode, branchId: branch.branchId } }
    );
  }

  return { label: 'CompanyTransfer', updated };
}

async function cleanupDuplicateBranches() {
  const branches = await Branch.find(
    { branchCode: { $in: OFFICIAL_BRANCHES.map((branch) => branch.branchCode) } },
    'branchName branchCode branchId address phone email status createdAt'
  ).sort({ createdAt: 1 }).lean();

  const grouped = branches.reduce((acc, branch) => {
    if (!acc.has(branch.branchCode)) acc.set(branch.branchCode, []);
    acc.get(branch.branchCode).push(branch);
    return acc;
  }, new Map());

  let removed = 0;
  const kept = [];

  for (const [branchCode, docs] of grouped.entries()) {
    const official = CODE_TO_BRANCH.get(branchCode);
    const keeper = docs.find((doc) => doc.branchId === official.branchId) || docs[0];
    await Branch.updateOne(
      { _id: keeper._id },
      {
        $set: {
          branchName: official.branchName,
          branchCode: official.branchCode,
          branchId: official.branchId,
          status: keeper.status || 'active',
        },
      }
    );

    const duplicateIds = docs.filter((doc) => String(doc._id) !== String(keeper._id)).map((doc) => doc._id);
    if (duplicateIds.length) {
      const result = await Branch.deleteMany({ _id: { $in: duplicateIds } });
      removed += result.deletedCount || 0;
    }
    kept.push(official.branchCode);
  }

  return { label: 'BranchDuplicates', removed, kept };
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf_farming';
  await mongoose.connect(uri);

  const summaries = [];
  summaries.push(await normalizeBranchIdModel(BranchManager, 'BranchManager', true));
  summaries.push(await normalizeBranchIdModel(FieldVisitor, 'FieldVisitor'));
  summaries.push(await normalizeBranchIdModel(Member, 'Member'));
  summaries.push(await normalizeBranchIdModel(Transaction, 'Transaction'));
  summaries.push(await normalizeBranchProducts());
  summaries.push(await normalizeCompanyTransfers());
  await syncBranchesFromManagers();
  summaries.push(await cleanupDuplicateBranches());

  const officialCodes = OFFICIAL_BRANCHES.map((branch) => branch.branchCode);
  const officialBranches = await Branch.find(
    { branchCode: { $in: officialCodes }, branchName: { $exists: true, $ne: null } },
    'branchName branchCode branchId'
  ).sort({ branchCode: 1 }).lean();
  const managerBranches = await BranchManager.distinct('branchId');

  console.log(JSON.stringify({ summaries, managerBranches, branchCount: officialBranches.length, officialBranches }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
