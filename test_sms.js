require('dotenv').config();
const smsService = require('./services/smsService');

async function testSMS() {
    const mobile = process.argv[2];
    if (!mobile) {
        console.error('Usage: node test_sms.js <mobile_number>');
        process.exit(1);
    }

    console.log(`Sending test SMS to ${mobile}...`);
    console.log(`Using Credentials: User=${process.env.MOBITEL_USERNAME}, URL=${process.env.MOBITEL_API_URL}`);

    try {
        const result = await smsService.sendOTP(mobile, '123456');
        console.log('Result:', result);
    } catch (e) {
        console.error('Error:', e);
    }
}

testSMS();
