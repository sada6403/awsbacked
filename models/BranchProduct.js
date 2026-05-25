const mongoose = require('mongoose');

const BranchProductSchema = new mongoose.Schema({
    branchId: {
        type: String,
        required: true,
        index: true
    },
    branchCode: {
        type: String,
        required: true,
        index: true
    },
    productId: {
        type: String,
        required: true
    },
    productRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        index: true
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
    stock: {
        type: Number,
        required: true,
        default: 0
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId
    },
    updatedByRole: {
        type: String
    },
    changeHistory: [{
        buyPrice: Number,
        sellPrice: Number,
        stock: Number,
        updatedBy: mongoose.Schema.Types.ObjectId,
        updatedByRole: String,
        updatedAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// Ensure unique price per product per branch
BranchProductSchema.index({ branchCode: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('BranchProduct', BranchProductSchema);
