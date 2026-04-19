const mongoose = require('mongoose');

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
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Branch', BranchSchema);
