require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');
const Member = require('./models/Member');
const Notification = require('./models/Notification');
const FieldVisitor = require('./models/FieldVisitor');

// MOCK CONSTANTS IF MODELS MISSING
// Assuming models exist since app runs.

const runDebug = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) throw new Error('Missing MONGODB_URI in .env');
        await mongoose.connect(uri);
        console.log('Connected to DB');

        // 1. Get Last Transaction
        const transaction = await Transaction.findOne().sort({ date: -1 });
        if (!transaction) {
            console.log('No transactions found.');
            return;
        }
        console.log('--------------------------------------------------');
        console.log('LATEST TRANSACTION:');
        console.log(`ID: ${transaction._id}`);
        console.log(`Bill: ${transaction.billNumber}`);
        console.log(`Date: ${transaction.date}`);
        console.log(`MemberID: ${transaction.memberId}`);
        console.log(`FVID: ${transaction.fieldVisitorId}`);
        console.log('--------------------------------------------------');

        // 2. Check Member
        const member = await Member.findById(transaction.memberId);
        console.log('MEMBER DETAILS:');
        if (member) {
            console.log(`Name: ${member.name}`);
            console.log(`Email: '${member.email}' (Type: ${typeof member.email})`);
            console.log(`Has Email? ${!!member.email}`);
        } else {
            console.log('Member NOT FOUND');
        }
        console.log('--------------------------------------------------');

        // 3. Check Notifications for this Transaction
        const notifs = await Notification.find({ transactionId: transaction._id });
        console.log(`NOTIFICATIONS FOUND: ${notifs.length}`);
        notifs.forEach((n, i) => {
            console.log(`[${i}] Title: ${n.title}`);
            console.log(`    User: ${n.userId}`);
            console.log(`    Role: ${n.userRole}`);
            console.log(`    Branch: ${n.branchId}`);
        });
        console.log('--------------------------------------------------');

    } catch (e) {
        console.error('Debug Error:', e);
    } finally {
        await mongoose.disconnect();
    }
};

runDebug();
