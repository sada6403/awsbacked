const mongoose = require('mongoose');

const CompanyTransferSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'userModel'
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
    receiptUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    }
}, { timestamps: true });

module.exports = mongoose.model('CompanyTransfer', CompanyTransferSchema);
