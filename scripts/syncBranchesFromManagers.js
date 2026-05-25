require('dotenv').config();

const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const BranchManager = require('../models/BranchManager');
const { syncBranchesFromManagers } = require('../utils/branchSync');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf_farming';
  await mongoose.connect(uri);

  const before = await Branch.countDocuments();
  const managerBranches = await BranchManager.distinct('branchId');
  const created = await syncBranchesFromManagers();
  const after = await Branch.countDocuments();
  const branches = await Branch.find({}, 'branchName branchCode branchId').sort({ branchCode: 1 }).lean();

  console.log(JSON.stringify({
    before,
    after,
    created: created.map((branch) => branch.branchCode),
    managerBranches,
    branches,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
