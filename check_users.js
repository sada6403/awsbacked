require('dotenv').config();
const mongoose = require('mongoose');

const checkUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming');
        console.log('Connected to MongoDB...');

        // Define minimal schema to read collection
        const FieldVisitorSchema = new mongoose.Schema({
            fieldVisitorId: String,
            name: String
        }, { strict: false });

        const FieldVisitor = mongoose.model('FieldVisitor', FieldVisitorSchema, 'fieldvisitors');

        const users = await FieldVisitor.find({});
        console.log('\n--- Local Field Visitors ---');
        console.log(JSON.stringify(users, null, 2));

        if (users.length === 0) {
            console.log('No users found! You might need to seed the database.');
        }

        mongoose.connection.close();
    } catch (e) {
        console.error(e);
    }
};

checkUsers();
