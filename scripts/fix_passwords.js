require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;

async function fix() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to Atlas for manual password fix...');

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);
        console.log('Generated hash:', hashedPassword);

        // Update BranchManager
        const mResult = await mongoose.connection.collection('branchmanagers').updateOne(
            { userId: 'manager1' },
            { $set: { password: hashedPassword } }
        );
        console.log('Manager update result:', mResult.modifiedCount ? 'SUCCESS' : 'NO CHANGE/NOT FOUND');

        // Update FieldVisitor
        const vResult = await mongoose.connection.collection('fieldvisitors').updateOne(
            { userId: 'fv1' },
            { $set: { password: hashedPassword } }
        );
        console.log('Visitor update result:', vResult.modifiedCount ? 'SUCCESS' : 'NO CHANGE/NOT FOUND');

        // Double check
        const check = await mongoose.connection.collection('branchmanagers').findOne({ userId: 'manager1' });
        console.log('Final check for manager1 - Password starts with $2:', check.password.startsWith('$2'));

        console.log('\nManual password hashing completed!');
        process.exit(0);
    } catch (error) {
        console.error('Manual fix failed:', error);
        process.exit(1);
    }
}

fix();
