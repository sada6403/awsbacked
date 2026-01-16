const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const FieldVisitorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    fullName: { type: String },
    userId: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    email: { type: String }, // Made optional in schema but required in logic if needed
    password: { type: String, required: true },
    code: { type: String },

    // Personal Details
    postalAddress: { type: String },
    permanentAddress: { type: String },
    dob: { type: Date },
    nic: { type: String },
    gender: { type: String },
    civilStatus: { type: String },

    // Education
    education: {
        ol: { type: mongoose.Schema.Types.Mixed }, // Store O/L results object
        al: { type: mongoose.Schema.Types.Mixed }, // Store A/L results object
        other: { type: String }
    },

    // Bank Details
    bankDetails: {
        bankName: { type: String },
        branch: { type: String },
        accountNumber: { type: String },
        accountName: { type: String }
    },

    // Other
    workExperience: { type: mongoose.Schema.Types.Mixed },
    references: { type: mongoose.Schema.Types.Mixed },

    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager', index: true },
    branchId: { type: String, required: true, default: 'default-branch', index: true },
    area: { type: String, required: true, default: 'default-area' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

FieldVisitorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

FieldVisitorSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('FieldVisitor', FieldVisitorSchema);
