const mongoose = require('mongoose');

const WalletTransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'userModel' },
    userModel: { type: String, required: true, enum: ['BranchManager', 'FieldVisitor'] },
    type: {
        type: String,
        enum: ['input', 'output', 'transfer_in', 'transfer_out', 'buy', 'sell'],
        required: true
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: String },
    relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    relatedUserId: { type: mongoose.Schema.Types.ObjectId, refPath: 'relatedUserModel' },
    relatedUserModel: { type: String, enum: ['BranchManager', 'FieldVisitor'] },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', WalletTransactionSchema);
