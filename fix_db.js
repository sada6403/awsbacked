require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming';

const run = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');

        try {
            // Drop all indexes on the 'members' collection
            // This will remove any lingering unique constraints on 'mobile', 'nic', etc.
            // The '_id' index is never dropped.
            const result = await mongoose.connection.collection('members').dropIndexes();
            console.log('Dropped indexes result:', result);
        } catch (e) {
            if (e.code === 26) {
                console.log('Namespace not found (collection does not exist yet).');
            } else {
                console.log('Error dropping indexes:', e.message);
            }
        }

        console.log('Database fix complete. Mongoose will recreate defined indexes on valid fields upon restart.');
        process.exit();
    } catch (e) {
        console.error('Connection error:', e);
        process.exit(1);
    }
};

run();
