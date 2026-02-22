const mongoose = require('mongoose');

const MemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
<<<<<<< HEAD
    address: { type: String }, // Can be empty if postal_address is used
    postal_address: { type: String }, // Support for existing data
    mobile: { type: String, required: true, unique: true },
    email: { type: String }, // Optional
    nic: { type: String, required: true, unique: true },
    memberCode: { type: String, unique: true }, // Generated ID
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', required: true, index: true },
=======
    address: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String }, // Optional
    nic: { type: String, required: true, unique: true },
    memberCode: { type: String, unique: true, sparse: true }, // Generated ID
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', index: true }, // Optional for Manager members
>>>>>>> a527a77 (Update backend with company transfer logic and error handling)
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    area: { type: String, default: 'default-area' }, // Area where member operates (must match FV area)
    registrationData: { type: Object }, // Store all verified registration details
    registeredAt: { type: Date, default: Date.now },
    profileImage: { type: String }, // Base64 encoded image
    memberType: { type: String, enum: ['New', 'Old'], default: 'New' },
    registrationFeePaid: { type: Boolean, default: false },
    biometricData: { type: String }, // Stores biometric confirmation or skip reason
    signatureImage: { type: String }, // Base64 encoded signature image
    idFrontImage: { type: String }, // Base64 encoded ID card front
    idBackImage: { type: String }, // Base64 encoded ID card back
    walletBalance: { type: Number, default: 0 }
});

module.exports = mongoose.model('Member', MemberSchema);
