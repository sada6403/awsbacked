const mongoose = require('mongoose');

const CompanyTransferSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userModel',
        index: true
    },
    userModel: {
        type: String,
        required: true,
        enum: ['FieldVisitor', 'BranchManager']
    },
    userRole: {
        type: String,
        required: true,
        enum: ['field_visitor', 'manager']
    },
    branchId: {
        type: String,
        index: true
    },
    branchCode: {
        type: String,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    depositorName: {
        type: String,
        required: true
    },
    depositorNic: {
        type: String,
        required: true
    },
    depositId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    receiptUrl: {
        type: String,
        required: true
    },
    receiptSentAt: {
        type: Date
    },
    receiptSendError: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
    },
    approvedAt: {
        type: Date
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdminUser'
    },
    rejectedAt: {
        type: Date
    },
    rejectionReason: {
        type: String
    },
    logs: [{
        status: String,
        note: String,
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
        actorName: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });
CompanyTransferSchema.index({ userId: 1, createdAt: -1 });
CompanyTransferSchema.index({ branchCode: 1, status: 1, createdAt: -1 });

CompanyTransferSchema.pre('save', function ensureDepositId(next) {
    if (!this.depositId) {
        const suffix = String(this._id).slice(-6).toUpperCase();
        this.depositId = `TRF-${new Date().getFullYear()}-${suffix}`;
    }
    next();
});

module.exports = mongoose.model('CompanyTransfer', CompanyTransferSchema);
