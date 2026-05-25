const mongoose = require('mongoose');

const OTPLogSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  email: { type: String },
  purpose: { type: String },
  status: { type: String, enum: ['sent', 'verified', 'failed', 'expired'], default: 'sent' },
  attempts: { type: Number, default: 0 },
  ipAddress: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OTPLog', OTPLogSchema);
