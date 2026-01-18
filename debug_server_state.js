require('dotenv').config();
const mongoose = require('mongoose');

// Mock Models
const TransactionSchema = new mongoose.Schema({
    billNumber: String,
    type: String,
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    fieldVisitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FieldVisitor' },
    totalAmount: Number,
    date: Date,
    pdfUrl: String
}, { strict: false });
const Transaction = mongoose.model('Transaction', TransactionSchema);

const MemberSchema = new mongoose.Schema({
    name: String,
    email: String
}, { strict: false });
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

const emailService = require('./services/emailService');
const { generateBillPDF } = require('./utils/pdfGenerator');

// Mock objects for PDF
const mockTransaction = { billNumber: 'DEBUG-PDF-001', type: 'buy', totalAmount: 500, date: new Date() };
const mockMember = { name: 'Debug Member', mobile: '0000000000', address: 'Debug Address' };
const mockFV = { name: 'Debug FV', userId: 'D001', phone: '1111111111', area: 'Debug Area' };


const runDebug = async () => {
    try {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri) throw new Error('MONGODB_URI is missing in .env');

        console.log('Connecting to DB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        // 1. Get Latest Transaction
        const transaction = await Transaction.findOne().sort({ _id: -1 }); // Sort by ID descending for speed
        if (!transaction) {
            console.log('No transactions found.');
            return;
        }

        console.log('=============================================');
        console.log(`LATEST TRANSACTION: ${transaction._id}`);
        console.log(`Date: ${transaction.date}`);
        console.log(`Bill: ${transaction.billNumber}`);
        console.log(`Member ID: ${transaction.memberId}`);
        console.log('=============================================');

        // 2. Check Member Email (Fetch fresh)
        let member = null;
        if (transaction.memberId) {
            member = await Member.findById(transaction.memberId);
            if (member) {
                console.log(`MEMBER: ${member.name}`);
                console.log(`EMAIL: '${member.email}'`);
            } else {
                console.log('>>> ERROR: Member not found!');
            }
        }

        // 3. Check Notifications
        const notifs = await Notification.find({ transactionId: transaction._id });
        console.log(`NOTIFICATIONS FOUND: ${notifs.length}`);

        // 4. Test PDF Generation & Email Attachment
        console.log('=============================================');
        console.log('TESTING PDF GENERATION...');
        let pdfPath = '';
        try {
            // Ensure public/bills exists? internal logic handles it
            pdfPath = await generateBillPDF(mockTransaction, mockMember, mockFV);
            console.log(`>>> PDF Generated at: ${pdfPath}`);
        } catch (err) {
            console.log(`>>> PDF Generation FAILED: ${err.message}`);
        }

        if (pdfPath) {
            console.log('TESTING EMAIL WITH ATTACHMENT...');
            // We use a hardcoded email for safety, or the member email found earlier
            const targetEmail = 'nfplantationsk@gmail.com';
            try {
                await emailService.sendBillEmail(targetEmail, {
                    name: 'Debug User',
                    type: 'DEBUG-PDF-TEST',
                    billNumber: 'DEBUG-PDF-001',
                    date: new Date().toISOString(),
                    amount: 500
                }, pdfPath);
                console.log('>>> SUCCESS: Email with Attachment Sent!');
            } catch (err) {
                console.log(`>>> FAILED to send email with attachment: ${err.message}`);
            }
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
    } finally {
        await mongoose.disconnect();
    }
};

runDebug();
