const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  userName: { type: String },
  userRole: { type: String },
  action: { type: String, required: true }, // e.g., 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'
  module: { type: String, required: true }, // e.g., 'Members', 'Transactions'
  documentId: { type: mongoose.Schema.Types.ObjectId },
  oldValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  deviceInfo: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
