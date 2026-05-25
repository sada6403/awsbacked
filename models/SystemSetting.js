const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  companyProfile: {
    name: { type: String },
    address: { type: String },
    contactNumber: { type: String },
    email: { type: String },
    logoUrl: { type: String }
  },
  branchSettings: {
    enforceOfficialMaster: { type: Boolean, default: true },
    autoAssignBranchId: { type: Boolean, default: true }
  },
  walletLimits: {
    lowBalanceThreshold: { type: Number, default: 1000 },
    maxTransactionLimit: { type: Number, default: 50000 }
  },
  security: {
    maxLoginAttempts: { type: Number, default: 5 },
    maxOtpAttempts: { type: Number, default: 3 }
  },
  notifications: {
    enableSms: { type: Boolean, default: true },
    enableEmail: { type: Boolean, default: true },
    enablePush: { type: Boolean, default: true }
  },
  paymentDetails: {
    bankName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String },
    branch: { type: String }
  },
  moduleToggles: {
    analytics: { type: Boolean, default: true },
    fraudAlerts: { type: Boolean, default: true },
    notifications: { type: Boolean, default: true },
    subAdmins: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
