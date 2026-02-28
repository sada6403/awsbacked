const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkTxs = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Transaction = require('./models/Transaction');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const txs = await Transaction.find({ date: { $gte: today } }).lean();
        console.log('START_OF_LIST');
        txs.forEach(tx => console.log(tx.billNumber));
        console.log('END_OF_LIST');
        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
};

checkTxs();
