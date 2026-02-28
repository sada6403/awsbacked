const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const analyzeTxsDetailed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Transaction = require('./models/Transaction');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const txs = await Transaction.find({ date: { $gte: today } }).sort({ createdAt: -1 }).lean();

        txs.forEach((tx, i) => {
            console.log(`TX_${i}: ${tx.billNumber} | ${tx.type} | ${tx.totalAmount} | ${tx.pdfUrl}`);
        });
        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
};

analyzeTxsDetailed();
