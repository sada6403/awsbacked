// test_db.js
require('dotenv').config();
const mongoose = require('mongoose');
const FieldVisitor = require('./models/FieldVisitor');

async function test() {
    console.log('Connecting to MongoDB...');
    console.time('DB Connection');
    await mongoose.connect(process.env.MONGODB_URI);
    console.timeEnd('DB Connection');

    console.log('Searching for Field Visitor: FV-JA-003...');
    console.time('Query Time');
    const user = await FieldVisitor.findOne({ userId: 'FV-JA-003' });
    console.timeEnd('Query Time');

    if (user) {
        console.log('User found:', user.fullName);
    } else {
        console.log('User NOT found.');
    }

    process.exit(0);
}

test().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
