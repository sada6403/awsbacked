const mongoose = require('mongoose');
require('dotenv').config();
const FieldVisitor = require('./models/FieldVisitor');

async function checkEmail() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const visitor = await FieldVisitor.findOne({ userId: 'FV-JA-003' });
        if (visitor) {
            console.log('Visitor FV-JA-003 details:');
            console.log('Name:', visitor.name);
            console.log('Email:', visitor.email || 'NULL/EMPTY');
            console.log('Full Doc:', JSON.stringify(visitor, null, 2));
        } else {
            console.log('Visitor FV-JA-003 not found');
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}
checkEmail();
