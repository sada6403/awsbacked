const mongoose = require('mongoose');
const { buildBranchId, normalizeBranchCode } = require('../utils/branchMaster');

const BranchSchema = new mongoose.Schema(
  {
    branchName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    branchCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    branchId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
    },
  },
  { timestamps: true }
);

BranchSchema.pre('validate', function setBranchDefaults(next) {
  if (this.branchCode) {
    this.branchCode = normalizeBranchCode(this.branchCode);
  }

  if (!this.branchId && this.branchCode) {
    this.branchId = buildBranchId(this.branchCode);
  }

  next();
});

BranchSchema.index({ branchCode: 1, status: 1 });
BranchSchema.index({ branchName: 1, branchCode: 1 });

module.exports = mongoose.model('Branch', BranchSchema);
