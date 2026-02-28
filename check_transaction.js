require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const last = await Transaction.findOne({ billNumber: 'NF-B-20260228-00003' }).lean();
        console.log(last);
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
});
