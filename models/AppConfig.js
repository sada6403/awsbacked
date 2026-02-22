const mongoose = require('mongoose');

const AppConfigSchema = new mongoose.Schema({
    appName: { type: String, required: true },
    appId: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'maintenance'], default: 'active' },
    minVersion: { type: String, default: '1.0.0' },
    environment: { type: String, enum: ['prod', 'dev', 'staging'], default: 'prod' },
    message: { type: String }, // Optional maintenance or update message
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('AppConfig', AppConfigSchema);
