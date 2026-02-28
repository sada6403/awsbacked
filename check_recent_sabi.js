const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkRecentSabiTx = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Transaction = require('./models/Transaction');
        const ManagersMember = require('./models/ManagersMember');

        const member = await ManagersMember.findOne({ mobile: '0743469972' }); // sabi
        if (!member) {
            console.log('Member sabi not found');
            return;
        }

        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const txs = await Transaction.find({
            memberId: member._id,
            createdAt: { $gte: fiveMinsAgo }
        }).sort({ createdAt: -1 }).lean();

        console.log(`Found ${txs.length} transactions for sabi in the last 5 minutes:`);
        txs.forEach(tx => {
            console.log(`${tx.billNumber} | ${tx.createdAt} | ${tx.totalAmount} | PDF: ${tx.pdfUrl}`);
        });

        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
    }
};

checkRecentSabiTx();
