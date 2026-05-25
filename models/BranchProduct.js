const mongoose = require('mongoose');

const BranchProductSchema = new mongoose.Schema({
    branchId: {
        type: String,
        required: true,
        index: true
    },
    productId: {
        type: String, // String ID like 'prod-001'
        required: true
    },
    buyPrice: {
        type: Number,
        required: true,
        default: 0
    },
    sellPrice: {
        type: Number,
        required: true,
        default: 0
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BranchManager'
    }
}, { timestamps: true });

// Ensure unique price per product per branch
BranchProductSchema.index({ branchId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('BranchProduct', BranchProductSchema);
