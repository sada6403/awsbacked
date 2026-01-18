require('dotenv').config();
const emailService = require('./services/emailService');

console.log('Testing Email Service...');
console.log('User:', process.env.EMAIL_USER);
console.log('Pass Length:', process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);

const testEmail = 'ksabiharan@gmail.com'; // User's email from chat

emailService.sendBillEmail(testEmail, {
    name: 'Sabiharan (Test)',
    type: 'TEST-BUY',
    billNumber: 'TEST-001',
    date: new Date().toLocaleDateString(),
    amount: 1000
    // No PDF for this simple test to verify connectivity first
}, null).then(res => {
    console.log('Test Result:', res);
}).catch(err => {
    console.error('Test Failed:', err);
});
