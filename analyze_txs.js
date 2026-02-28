const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const analyzeTxs = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error('MONGODB_URI not found');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('Connected to MongoDB');
        const Transaction = require('./models/Transaction');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const txs = await Transaction.find({ date: { $gte: today } }).sort({ createdAt: -1 }).lean();

        console.log('--- ANALYSIS START ---');
        console.log(`Found ${txs.length} transactions today.`);

        txs.forEach((tx, index) => {
            console.log(`\n[TX ${index + 1}]`);
            console.log(`Bill: ${tx.billNumber}`);
            console.log(`ID: ${tx._id}`);
            console.log(`Type: ${tx.type}`);
            console.log(`MemberModel: ${tx.memberModel}`);
            console.log(`Product: ${tx.productName}`);
            console.log(`Amount: ${tx.totalAmount}`);
            console.log(`PDF URL: ${tx.pdfUrl}`);
            console.log(`FieldVisitorId: ${tx.fieldVisitorId}`);
            console.log(`CreatedAt: ${tx.createdAt}`);

            // Checks
            if (!tx.pdfUrl) console.warn('WARNING: pdfUrl is missing!');
            if (tx.pdfUrl && !tx.pdfUrl.startsWith('/bills/')) console.warn('WARNING: pdfUrl format might be wrong!');
        });
        console.log('\n--- ANALYSIS END ---');

        await mongoose.connection.close();
    } catch (err) {
        console.error('ANALYSIS ERROR:', err);
    }
};

analyzeTxs();
