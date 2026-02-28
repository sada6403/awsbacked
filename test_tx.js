const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const testCreateTransaction = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const ManagersMember = require('./models/ManagersMember');
        const BranchManager = require('./models/BranchManager');
        const Product = require('./models/Product');
        const Transaction = require('./models/Transaction');
        const { generateBillPDF } = require('./utils/pdfGenerator');

        // Target: sabi
        const member = await ManagersMember.findOne({ mobile: '0743469972' });
        if (!member) throw new Error('Member sabi not found');

        const manager = await BranchManager.findById(member.addedBy);
        if (!manager) throw new Error('Manager not found');

        console.log(`Using Manager: ${manager.fullName}, Balance: ${manager.walletBalance}, Branch: ${manager.branchId}`);

        // Mock request body
        const reqBody = {
            transactionType: 'BUY',
            memberId: member._id.toString(),
            productId: 'prod-aloe-packet',
            quantity: 150,
            unitType: 'packets',
            unitPrice: 25
        };

        // Mock req.user
        const reqUser = {
            _id: manager._id,
            role: 'manager',
            branchId: manager.branchId
        };

        // Simulate logic from transactionController.js
        const normalizedType = reqBody.transactionType.toLowerCase();
        const totalAmount = Number(reqBody.quantity) * Number(reqBody.unitPrice);

        console.log(`Payload: Type=${normalizedType}, Total=${totalAmount}`);

        const product = await Product.findOne({ productId: reqBody.productId });
        const productName = product ? product.name : 'Unknown Product';

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const prefix = `NF-B-${dateStr}`;
        const billNumber = `${prefix}-TEST-001`; // Mock bill number

        console.log(`Drafting transaction: ${billNumber}`);

        const transaction = new Transaction({
            billNumber,
            type: normalizedType,
            memberId: member._id,
            memberModel: 'ManagersMember',
            productName,
            quantity: Number(reqBody.quantity),
            unitType: reqBody.unitType,
            unitPrice: Number(reqBody.unitPrice),
            totalAmount,
            branchId: manager.branchId,
            date: new Date()
        });

        const officer = {
            name: manager.fullName,
            userId: manager.userId,
            phone: manager.phone,
            area: manager.branchName,
            role: 'Manager'
        };

        console.log('Step: Generating PDF...');
        try {
            const pdfUrl = await generateBillPDF(transaction, member, officer);
            console.log('PDF Generated:', pdfUrl);
            transaction.pdfUrl = pdfUrl;
        } catch (pdfErr) {
            console.error('PDF Error:', pdfErr);
            throw pdfErr;
        }

        console.log('Step: Updating Manager Balance...');
        if (manager.walletBalance < totalAmount) {
            throw new Error('Insufficient wallet balance');
        }
        manager.walletBalance -= totalAmount;
        await manager.save();
        console.log('Balance updated.');

        console.log('Step: Saving Transaction...');
        const saved = await transaction.save();
        console.log('Transaction saved successfully!', saved._id);

        await mongoose.connection.close();
    } catch (err) {
        console.error('FATAL TEST ERROR:', err);
        process.exit(1);
    }
};

testCreateTransaction();
