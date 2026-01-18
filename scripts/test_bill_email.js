require('dotenv').config();
const emailService = require('../services/emailService');
const path = require('path');
const fs = require('fs');

async function test() {
    console.log('Testing Bill Email with Attachment...');
    const recipient = process.env.EMAIL_USER; // Send to self

    // Create a dummy PDF file for testing
    const pdfDir = path.join(__dirname, '..', 'public', 'bills');
    if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
    }
    const pdfPath = path.join(pdfDir, 'test_bill.txt');
    fs.writeFileSync(pdfPath, 'This is a dummy PDF content for testing.');

    // Relative path as stored in DB
    const relativePdfUrl = '/bills/test_bill.txt';

    try {
        const result = await emailService.sendBillEmail(
            recipient,
            {
                name: 'Test Member',
                type: 'BUY',
                billNumber: 'NF-TEST-001',
                date: '2025-01-18',
                amount: 1500
            },
            relativePdfUrl
        );
        console.log('Result:', result);
    } catch (error) {
        console.error('Test Failed:', error);
    }
}

test();
