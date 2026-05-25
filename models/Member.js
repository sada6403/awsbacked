const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String }, // Optional
    nic: { type: String, required: true, unique: true },
    memberCode: { type: String, unique: true, sparse: true }, // Generated ID
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', index: true }, // Optional for Manager members
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    area: { type: String, default: 'default-area' }, // Area where member operates (must match FV area)
    registrationData: { type: Object }, // Store all verified registration details
    registeredAt: { type: Date, default: Date.now, index: true },
    profileImage: { type: String }, // Base64 encoded image
    memberType: { type: String, enum: ['New', 'Old'], default: 'New' },
    status: { type: String, enum: ['active', 'blocked'], default: 'active' },
    registrationFeePaid: { type: Boolean, default: false },
    biometricData: { type: String }, // Stores biometric confirmation or skip reason
    signatureImage: { type: String }, // Base64 encoded signature image
    idFrontImage: { type: String }, // Base64 encoded ID card front
    idBackImage: { type: String }, // Base64 encoded ID card back
    walletBalance: { type: Number, default: 0 },
    totalBuyAmount: { type: Number, default: 0 },
    totalSellAmount: { type: Number, default: 0 }
});

MemberSchema.index({ branchId: 1, status: 1, registeredAt: -1 });
MemberSchema.index({ branchId: 1, fieldVisitorId: 1 });

module.exports = mongoose.model('Member', MemberSchema);
