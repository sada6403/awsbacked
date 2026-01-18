const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    mobile: { type: String, required: true, index: true },
    otp: { type: String, required: true },
    expires: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 } // TTL index: documents expire after 300 seconds (5 mins)
});

module.exports = mongoose.model('Otp', otpSchema);
