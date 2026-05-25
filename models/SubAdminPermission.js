const mongoose = require('mongoose');

const PermissionSchema = new mongoose.Schema({
  module: { type: String, required: true },
  canView: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  canApprove: { type: Boolean, default: false },
  canReject: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  canBlock: { type: Boolean, default: false },
  canUnblock: { type: Boolean, default: false },
}, { _id: false });

const SubAdminPermissionSchema = new mongoose.Schema({
  adminUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, unique: true },
  permissions: [PermissionSchema],
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' }
}, {
  timestamps: true
});

module.exports = mongoose.model('SubAdminPermission', SubAdminPermissionSchema);
