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
        // strict: false handles if the schema is strict but we want to be safe
        await Otp.findOneAndUpdate(
            { mobile },
            {
                otp,
                expires,
                createdAt: new Date() // Reset TTL
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Send SMS
        await smsService.sendOTP(mobile, otp);

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
        const { mobile, otp } = req.body;
        console.log('Verifying OTP for:', mobile, 'Entered OTP:', otp);

        if (!mobile || !otp) {
            return res.status(400).json({ success: false, message: 'Mobile and OTP required' });
        }

        // Find in DB
        const record = await Otp.findOne({ mobile });

        if (!record) {
            console.log('OTP Record not found in DB for:', mobile);
            return res.status(400).json({ success: false, message: 'No OTP found for this number' });
        }

        // Check Expiry
        if (new Date() > record.expires) {
            await Otp.deleteOne({ mobile });
            console.log('OTP Expired for:', mobile);
            return res.status(400).json({ success: false, message: 'OTP expired' });
        }

        // Check Match
        if (record.otp !== otp) {
            console.log('Invalid OTP for:', mobile);
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        // Success - Consume OTP
        await Otp.deleteOne({ mobile });
        console.log('OTP Verified Successfully for:', mobile);

        res.status(200).json({ success: true, message: 'OTP verified successfully' });

    } catch (error) {
        console.error('OTP Verify Error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
};
