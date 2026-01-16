// controllers/smsController.js
const smsService = require('../services/smsService');

// In-memory OTP store for simple verification (Production should use Redis/DB)
const otpStore = new Map(); // mobile -> { otp, expires }

exports.generateOtp = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number required' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000; // 5 mins

        // Store OTP
        otpStore.set(mobile, { otp, expires });

        // Send SMS
        await smsService.sendOTP(mobile, otp);

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
            // In dev mode, maybe return it for convenience? 
            // devOtp: otp 
        });
    } catch (error) {
        console.error('OTP Generate Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
        }

        const record = otpStore.get(mobile);
        if (!record) {
            return res.status(400).json({ success: false, message: 'No OTP found for this number' });
        }

        if (Date.now() > record.expires) {
            otpStore.delete(mobile);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        if (record.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Success
        otpStore.delete(mobile); // Consume OTP
        res.status(200).json({ success: true, message: 'OTP verified successfully' });

    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};
