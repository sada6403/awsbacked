require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

const generateBillNumber = async (type) => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const prefix = `NF-${type[0]}-${dateStr}`;

    console.log(`Prefix: ${prefix}`);
    // Find the latest transaction with this prefix to get the highest sequence
    const lastTransaction = await Transaction.findOne({
        billNumber: new RegExp(`^${prefix}-`)
    }).sort({ billNumber: -1 }).lean();

    console.log(`Last transaction found:`, lastTransaction ? lastTransaction.billNumber : 'None');

    let nextSequence = 1;
    if (lastTransaction && lastTransaction.billNumber) {
        const parts = lastTransaction.billNumber.split('-');
        const lastSeq = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
        }
    }

    const sequenceStr = nextSequence.toString().padStart(5, '0');
    return `${prefix}-${sequenceStr}`;
};

async function test() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const bill = await generateBillNumber('BUY');
        console.log(`Generated: ${bill}`);

        // Try to insert it? Let's just see what it is first
        const existing = await Transaction.findOne({ billNumber: bill });
        console.log('Exists in DB?', existing ? existing._id : 'No');
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

test();
