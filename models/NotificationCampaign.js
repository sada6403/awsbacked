const mongoose = require('mongoose');

const NotificationCampaignSchema = new mongoose.Schema(
  {
    title: { type: String },
    message: { type: String, required: true },
    type: { type: String, enum: ['app', 'sms', 'email'], required: true },
    audienceType: { type: String, required: true },
    branchId: { type: String },
    branchCode: { type: String, index: true },
    targetCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'sent', 'partial', 'failed'], default: 'sent' },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    specificEmail: { type: String },
    specificPhone: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NotificationCampaign', NotificationCampaignSchema);
