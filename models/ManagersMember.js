const mongoose = require('mongoose');

const ManagersMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String },
    nic: { type: String, required: true, unique: true },
    memberCode: { type: String, unique: true, sparse: true },
    idFrontImage: { type: String },
    idBackImage: { type: String },
    profileImage: { type: String },
    signatureImage: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager', required: true, index: true },
    branchId: { type: String, index: true },
    area: { type: String },
    memberType: { type: String, enum: ['New', 'Old'], default: 'New' },
    registrationFeePaid: { type: Boolean, default: false },
    pdfUrl: { type: String },
    isFirstTransactionDone: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('ManagersMember', ManagersMemberSchema, 'managermember');
