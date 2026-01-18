require('dotenv').config();
const mongoose = require('mongoose');
const Member = require('../models/Member');

async function check() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming';
        console.log('Connecting to:', uri);
        await mongoose.connect(uri, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to DB');

        const count = await Member.countDocuments();
        console.log(`Total Members: ${count}`);

        const members = await Member.find().sort({ registeredAt: -1 }).limit(10);
        console.log('--- Latest 10 Members ---');
        members.forEach(m => {
            console.log(`Name: ${m.name}, Email: '${m.email}'`);
        });
        console.log('Script finished');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

check();
