const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String }, // Optional
    nic: { type: String, required: true },
    memberCode: { type: String, unique: true }, // Generated ID
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', required: true, index: true },
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    area: { type: String, required: true, default: 'default-area' }, // Area where member operates (must match FV area)
    registrationData: { type: Object }, // Store all verified registration details
    registeredAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Member', MemberSchema);
