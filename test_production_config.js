require('dotenv').config();
const smsService = require('./services/smsService');

async function run() {
    console.log('Testing Production SMS Service...');
    console.log('API URL:', process.env.MOBITEL_API_URL);

    try {
        const mobile = process.argv[2] || '0771234567';
        console.log(`Testing OTP to ${mobile}...`);
        const result = await smsService.sendOTP(mobile, '999999');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    }
}

run();
