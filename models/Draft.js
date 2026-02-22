const mongoose = require('mongoose');

const DraftSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ['Member', 'FieldVisitor'], required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    lastStep: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Draft', DraftSchema);
