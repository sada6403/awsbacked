const mongoose = require('mongoose');

const RequestLogSchema = new mongoose.Schema({
    requestId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    response: {
        type: Object,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400 // 24 hours in seconds
    }
});

module.exports = mongoose.model('RequestLog', RequestLogSchema);
