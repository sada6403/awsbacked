const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const WalletTransaction = require('../models/WalletTransaction');
const { normalizeBranchCode } = require('./branchMaster');

function supportsTransactions() {
  return process.env.USE_TRANSACTIONS !== 'false';
}

async function startOptionalSession() {
  if (!supportsTransactions()) {
    return null;
  }

  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    return session;
  } catch (error) {
    console.warn('[WalletAdmin] Mongo transactions unavailable, falling back to non-transactional flow.');
    return null;
  }
}

async function loadBranchDirectory() {
  const branches = await Branch.find({}, 'branchCode branchName branchId').lean();
  return new Map(branches.map((branch) => [branch.branchCode, branch]));
}

async function loadWalletUsersByBranchCodes(branchCodes = []) {
  const query = branchCodes.length > 0 ? { branchId: { $in: branchCodes.map(normalizeBranchCode) } } : {};
  const [managers, fieldVisitors] = await Promise.all([
    BranchManager.find(query, 'fullName name email phone branchId walletBalance status').lean(),
    FieldVisitor.find(query, 'fullName name email phone branchId walletBalance status managerId').lean(),
  ]);

  return { managers, fieldVisitors };
}

function getUserMeta(userModel) {
  if (userModel === 'BranchManager') {
    return { Model: BranchManager, userModel: 'BranchManager', roleLabel: 'Branch Manager' };
  }

  return { Model: FieldVisitor, userModel: 'FieldVisitor', roleLabel: 'Field Visitor' };
}

async function createWalletTransaction({
  session,
  userId,
  userModel,
  type,
  amount,
  balanceAfter,
  reference,
  relatedUserId,
  relatedUserModel,
}) {
  const walletTransaction = new WalletTransaction({
    userId,
    userModel,
    type,
    amount: Number(amount),
    balanceAfter: Number(balanceAfter),
    reference,
    relatedUserId: relatedUserId || undefined,
    relatedUserModel: relatedUserModel || undefined,
  });

  await walletTransaction.save(session ? { session } : undefined);
  return walletTransaction;
}

module.exports = {
  createWalletTransaction,
  getUserMeta,
  loadBranchDirectory,
  loadWalletUsersByBranchCodes,
  startOptionalSession,
  supportsTransactions,
};
