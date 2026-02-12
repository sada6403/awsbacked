const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    billNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', required: true, index: true },
    productName: { type: String, required: true }, // Store name snapshot
    quantity: { type: Number, required: true },
    unitType: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    pdfUrl: { type: String }, // Path to generated PDF
    idempotencyKey: { type: String, unique: true, sparse: true } // Key to prevent duplicate transactions
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
