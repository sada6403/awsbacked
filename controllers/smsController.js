// controllers/smsController.js
const smsService = require('../services/smsService');
const Otp = require('../models/Otp');

// In-memory OTP store REMOVED. Using MongoDB.

exports.generateOtp = async (req, res) => {
    try {
        const { mobile } = req.body;
        if (!mobile) {
            return res.status(400).json({ success: false, message: 'Mobile number required' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // 5 minutes expiry
        const expires = new Date(Date.now() + 5 * 60 * 1000);

        // Update or Insert (Upsert) into MongoDB
        await Otp.findOneAndUpdate(
            { identifier: mobile }, // Key
            {
                otp,
                expires,
                createdAt: new Date() // Reset TTL
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Send SMS
        const smsResult = await smsService.sendOTP(mobile, otp);

        if (!smsResult || !smsResult.success) {
            console.error('SMS Send Failed:', smsResult);
            return res.status(500).json({
                success: false,
                message: 'Failed to send SMS upstream',
                details: smsResult // Optional: expose details for debugging
            });
        }

        console.log(`OTP Generated for ${mobile}: ${otp}`); // Keep for debug

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully',
        });
    } catch (error) {
        console.error('OTP Generate Error:', error);
        res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { mobile, email, otp } = req.body;
        const identifier = mobile || email; // Support both
        console.log('Verifying OTP for:', identifier, 'Entered OTP:', otp);

        if (!identifier || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile/Email and OTP required' });
        }

        // Find in DB
        const record = await Otp.findOne({ identifier });

        if (!record) {
            console.log('OTP Record not found in DB for:', identifier);
            return res.status(400).json({ success: false, message: 'No OTP found for this number/email' });
        }

        // Check Expiry
        if (new Date() > record.expires) {
            await Otp.deleteOne({ identifier });
            console.log('OTP Expired for:', identifier);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Check Match
        if (String(record.otp).trim() !== String(otp).trim()) {
            console.log(`Invalid OTP for: ${identifier}. Expected: ${record.otp}, Received: ${otp}`);
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Success - Consume OTP
        await Otp.deleteOne({ identifier });
        console.log('OTP Verified Successfully for:', identifier);

        res.status(200).json({ success: true, message: 'OTP verified successfully' });

    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};
