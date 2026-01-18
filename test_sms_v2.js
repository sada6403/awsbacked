require('dotenv').config();
const https = require('https');

async function testSMS() {
    const mobile = process.argv[2];
    if (!mobile) {
        console.error('Usage: node test_sms_v2.js <mobile_number>');
        process.exit(1);
    }

    // Try the BulkSMS endpoint structure
    const baseUrl = 'https://msmsenterprise.mobitel.lk/BulkSMS/SendSMS';
    const params = new URLSearchParams({
        username: process.env.MOBITEL_USERNAME,
        password: process.env.MOBITEL_PASSWORD,
        sender: process.env.MOBITEL_SENDER_ID,
        message: 'Test OTP 123456',
        beneficiary: mobile
    });

    const fullUrl = `${baseUrl}?${params.toString()}`;

    console.log(`Testing URL: ${fullUrl.replace(process.env.MOBITEL_PASSWORD, '***')}`);

    https.get(fullUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`Response Code: ${res.statusCode}`);
            console.log(`Body: ${data}`);
        });
    }).on('error', (e) => {
        console.error('Error:', e);
    });
}

testSMS();
