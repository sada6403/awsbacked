require('dotenv').config();
const mongoose = require('mongoose');
const Member = require('../models/Member');

const auditEmails = async () => {
    try {
        // Hardcoded for debug reliability
        const uri = 'mongodb+srv://cst23071_db_user:vgquPlo0tLETMjvK@cluster0.s8fljgu.mongodb.net/nf-farming?retryWrites=true&w=majority';
        if (!uri) {
            console.error('MONGODB_URI not found in .env');
            process.exit(1);
        }

        console.log('Connecting to DB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        const members = await Member.find({});
        console.log(`\nFound ${members.length} members. Checking Emails:\n`);
        console.log('----------------------------------------------------');
        console.log(String('Name').padEnd(20) + String('Code').padEnd(15) + String('Email (Root)').padEnd(30) + String('Email (RegData)'));
        console.log('----------------------------------------------------');

        console.log('Printing first 10 members to verify data structure:');
        members.slice(0, 10).forEach(m => {
            console.log(
                String(m.name).substring(0, 18).padEnd(20) +
                String(m.memberCode).padEnd(15) +
                String(m.email || 'MISSING').padEnd(30) +
                String(m.registrationData?.email || 'N/A')
            );
        });
        console.log('----------------------------------------------------');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

auditEmails();
