const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const listTodayTxs = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Transaction = require('./models/Transaction');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const txs = await Transaction.find({ date: { $gte: today } }).sort({ createdAt: -1 }).lean();

        console.log(`Found ${txs.length} transactions today:`);
        txs.forEach(tx => {
            console.log(`${tx.billNumber} | ${tx.memberId} | Rs. ${tx.totalAmount} | Type: ${tx.type} | CreatedAt: ${tx.createdAt}`);
        });

        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
};

listTodayTxs();
