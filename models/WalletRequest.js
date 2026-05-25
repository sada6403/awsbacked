const mongoose = require('mongoose');

const WalletRequestSchema = new mongoose.Schema({
    fvId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', required: true, index: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager', index: true },
    amount: { type: Number, required: true },
    requestedDate: { type: Date, required: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' }, // Optional: If request is specifically for a member
    fvNote: { type: String },
    managerNote: { type: String },
    isProcessed: { type: Boolean, default: false }
}, { timestamps: true });
WalletRequestSchema.index({ managerId: 1, createdAt: -1 });
WalletRequestSchema.index({ fvId: 1, createdAt: -1 });

module.exports = mongoose.model('WalletRequest', WalletRequestSchema);
