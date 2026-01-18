require('dotenv').config();
const emailService = require('../services/emailService');

async function test() {
    console.log('Testing Email Service...');
    console.log('User:', process.env.EMAIL_USER);

    // Replace with a valid recipient email for testing
    const recipient = process.env.EMAIL_USER;

    try {
        const result = await emailService.sendEmail(
            recipient,
            'Test Email from NF Farming',
            'This is a test email to verify configuration.'
        );
        console.log('Result:', result);
    } catch (error) {
        console.error('Test Failed:', error);
    }
}

test();
