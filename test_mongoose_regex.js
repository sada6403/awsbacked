require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    try {
        const prefix = 'NF-B-20260228';
        const regexStr = `^${prefix}-\\d+$`;
        console.log('Regex String:', regexStr);
        const regex = new RegExp(regexStr);
        console.log('Regex:', regex);

        const last = await Transaction.findOne({ billNumber: regex }).sort({ billNumber: -1 }).lean();
        console.log('Last found with RegExp:', last ? last.billNumber : 'null');

        const literal = await Transaction.findOne({ billNumber: 'NF-B-20260228-00001' }).lean();
        console.log('Found with literal string:', literal ? literal.billNumber : 'null');

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
});
