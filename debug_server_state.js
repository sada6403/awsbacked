require('dotenv').config();
const mongoose = require('mongoose');

// Define/Mock Models locally to ensure standalone execution
const TransactionSchema = new mongoose.Schema({}, { strict: false });
const Transaction = mongoose.model('Transaction', TransactionSchema);

const MemberSchema = new mongoose.Schema({}, { strict: false });
const Member = mongoose.model('Member', MemberSchema);

const NotificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    date: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    attachment: { type: String },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor' },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BranchManager' },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    branchId: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userRole: { type: String, enum: ['field_visitor', 'branch_manager', 'manager'], required: true }
});
const Notification = mongoose.model('Notification', NotificationSchema);

// Email Service Mock/Import
const emailService = require('./services/emailService');

const runDebug = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) throw new Error('MONGODB_URI/MONGO_URI is missing in .env');

        console.log('Connecting to DB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        // 1. Get Latest Transaction
        const transaction = await Transaction.findOne().sort({ createdAt: -1 });
        if (!transaction) {
            console.log('No transactions found.');
            return;
        }

        console.log('=============================================');
        console.log(`LATEST TRANSACTION: ${transaction._id}`);
        console.log(`Date: ${transaction.createdAt}`);
        console.log(`Bill: ${transaction.billNumber}`);
        console.log(`Member ID: ${transaction.memberId}`);
        console.log('=============================================');

        // 2. Check Member Email
        let member = null;
        if (transaction.memberId) {
            member = await Member.findById(transaction.memberId);
            if (member) {
                console.log(`MEMBER: ${member.name}`);
                console.log(`EMAIL: '${member.email}'`);
                if (!member.email) console.log('>>> WARNING: Email is missing or empty!');
                else console.log('>>> Email is present.');
            } else {
                console.log('>>> ERROR: Member not found!');
            }
        }

        // 3. Check Notifications
        const notifs = await Notification.find({ transactionId: transaction._id });
        console.log('=============================================');
        console.log(`NOTIFICATIONS FOUND: ${notifs.length}`);
        if (notifs.length === 0) {
            console.log('>>> WARNING: No notification created for this transaction.');
        } else {
            notifs.forEach(n => {
                console.log(`- Title: ${n.title}`);
                console.log(`- Recipient (UserId): ${n.userId}`);
                console.log(`- Role: ${n.userRole}`);
            });
        }

        // 4. Test Notification Creation (Simulation)
        if (notifs.length === 0 && transaction.fieldVisitorId) {
            console.log('=============================================');
            console.log('ATTEMPTING TEST NOTIFICATION CREATION...');
            try {
                const newNotif = new Notification({
                    title: 'Test Notification',
                    body: 'This is a debug test.',
                    transactionId: transaction._id,
                    userId: transaction.fieldVisitorId, // Assuming FV is the user
                    userRole: 'field_visitor',
                    branchId: 'debug-branch'
                });
                await newNotif.save();
                console.log('>>> SUCCESS: Test notification saved. (DB is writable, Schema matches)');
                // Cleanup
                await Notification.findByIdAndDelete(newNotif._id);
                console.log('>>> CLEANUP: Test notification deleted.');
            } catch (err) {
                console.log(`>>> FAILED to create notification: ${err.message}`);
            }
        }

        // 5. Test Email Sending (if member has email)
        if (member && member.email) {
            console.log('=============================================');
            console.log(`ATTEMPTING TEST EMAIL to ${member.email}...`);
            try {
                await emailService.sendBillEmail(member.email, {
                    name: member.name,
                    type: 'DEBUG-TEST',
                    billNumber: transaction.billNumber,
                    date: new Date().toISOString(),
                    amount: 999
                }, null); // No PDF for test
                console.log('>>> SUCCESS: Email sent (Check inbox).');
            } catch (err) {
                console.log(`>>> FAILED to send email: ${err.message}`);
            }
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        await mongoose.disconnect();
    }
};

runDebug();
