const mongoose = require('mongoose');

const ExtraMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String },
    nic: { type: String, required: true, unique: true },
    memberCode: { type: String, unique: true, sparse: true }, // Generated ID
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', required: true, index: true },
    collectedAt: { type: Date, default: Date.now },
    branchId: { type: String, index: true },
    area: { type: String },
    registrationData: { type: Object },
    profileImage: { type: String },
    memberType: { type: String, enum: ['New', 'Old'], default: 'New' },
    registrationFeePaid: { type: Boolean, default: false },
    biometricData: { type: String },
    signatureImage: { type: String },
    idFrontImage: { type: String },
    idBackImage: { type: String },
    walletBalance: { type: Number, default: 0 },
    notes: { type: String }
}, { timestamps: true });

// Compound index to help with daily queries
ExtraMemberSchema.index({ collectedBy: 1, collectedAt: 1 });

module.exports = mongoose.model('ExtraMember', ExtraMemberSchema, 'leads');
