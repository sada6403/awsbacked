const mongoose = require('mongoose');

const FraudAlertSchema = new mongoose.Schema({
  type: { type: String, required: true }, // e.g., 'low_wallet_balance', 'large_transaction'
  severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], required: true },
  description: { type: String, required: true },
  branchId: { type: String },
  branchCode: { type: String, index: true },
  relatedUser: { type: mongoose.Schema.Types.ObjectId, refPath: 'userRole' },
  userRole: { type: String },
  relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  status: { type: String, enum: ['Pending', 'Resolved', 'Dismissed'], default: 'Pending' },
  investigationNote: { type: String },
  reviewNotes: [{
    note: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    addedAt: { type: Date, default: Date.now }
  }],
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  resolvedAt: { type: Date }
}, {
  timestamps: true
});

module.exports = mongoose.model('FraudAlert', FraudAlertSchema);
