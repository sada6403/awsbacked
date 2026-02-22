const mongoose = require('mongoose');

const ManagersMemberSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String }, // Optional but good to have
    nic: { type: String }, // Optional
    idFrontImage: { type: String },
    idBackImage: { type: String },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager', required: true, index: true },
    isFirstTransactionDone: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ManagersMember', ManagersMemberSchema, 'managermember');
