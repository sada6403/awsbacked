const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    billNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['buy', 'sell'], required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    memberModel: { type: String, required: true, enum: ['Member', 'ExtraMember', 'ManagersMember'], default: 'Member' },
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', index: true },
    productName: { type: String, required: true }, // Store name snapshot
    quantity: { type: Number, required: true },
    unitType: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now, index: true },
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    pdfUrl: { type: String } // Path to generated PDF
}, { timestamps: true });

// Compound indexes for faster dashboard aggregations and reporting
TransactionSchema.index({ branchId: 1, date: 1 });
TransactionSchema.index({ fieldVisitorId: 1, date: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
