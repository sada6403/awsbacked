const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nf_farming');
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        const Member = require('../models/Member');
        const FieldVisitor = require('../models/FieldVisitor');
        const Transaction = require('../models/Transaction');

        console.log('Applying Unique Indexes...');

        // 1. Members: mobile and nic (already in schema but to be sure)
        // Note: createIndexes() is needed to ensure they are applied immediately
        await Member.collection.createIndex({ mobile: 1 }, { unique: true });
        await Member.collection.createIndex({ nic: 1 }, { unique: true });
        console.log('✅ Member indexes applied.');

        // 2. FieldVisitor: phone and nic
        await FieldVisitor.collection.createIndex({ phone: 1 }, { unique: true });
        await FieldVisitor.collection.createIndex({ nic: 1 }, { unique: true, sparse: true });
        console.log('✅ FieldVisitor indexes applied.');

        // 3. Transactions: idempotencyKey
        await Transaction.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
        console.log('✅ Transaction idempotency index applied.');

        console.log('Migration Completed Successfully.');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

connectDB();
