require('dotenv').config();
const smsService = require('./services/smsService');

async function run() {
    console.log('Testing Production SMS Service...');
    console.log('API URL:', process.env.MOBITEL_API_URL);

    try {
        const result = await smsService.sendOTP('0771234567', '999999');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    }
}

run();
