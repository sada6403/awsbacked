const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BranchManagerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    branchName: {
      type: String,
      required: true,
    },
    branchId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: 'branch_manager',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    walletBalance: {
      type: Number,
      default: 0,
    },
    profileImage: { type: String }, // Base64 image string
    fcmToken: { type: String, index: true },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
BranchManagerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

BranchManagerSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('BranchManager', BranchManagerSchema);
