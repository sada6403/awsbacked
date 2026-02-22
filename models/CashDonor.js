const mongoose = require('mongoose');

const CashDonorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    idNumber: { type: String }, // NIC or other ID
    phone: { type: String, required: true, unique: true, index: true },
    role: { type: String }, // e.g., 'Investor', 'Owner'
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('CashDonor', CashDonorSchema);
