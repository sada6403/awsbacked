require('dotenv').config();
const smsService = require('./services/smsService');

// Temporary override of provider's senderId
async function run() {
    console.log('Testing Default Sender ID (from .env):');
    await smsService.sendOTP('94771234567', '111111');

    console.log('\nTesting Sender ID "Mobitel":');
    smsService.provider.senderId = 'Mobitel';
    await smsService.sendOTP('94771234567', '222222');

    console.log('\nTesting Sender ID "NF_Farming" (Underscore):');
    smsService.provider.senderId = 'NF_Farming';
    await smsService.sendOTP('94771234567', '333333');
}

run();
