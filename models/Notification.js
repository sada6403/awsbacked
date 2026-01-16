const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    date: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    attachment: { type: String }, // Optional PDF link
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', index: true },
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor', index: true },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager', index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', index: true },
    branchId: { type: String, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // recipient user
    userRole: { type: String, enum: ['field_visitor', 'branch_manager', 'manager'], required: true }
});

module.exports = mongoose.model('Notification', NotificationSchema);
