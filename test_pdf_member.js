const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const testPDFAndMember = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const Transaction = require('./models/Transaction');
        const ManagersMember = require('./models/ManagersMember');
        const BranchManager = require('./models/BranchManager');
        const { generateBillPDF } = require('./utils/pdfGenerator');

        const tx = await Transaction.findOne({ billNumber: 'NF-B-20260228-00001' }).lean();
        if (!tx) throw new Error('TX not found');

        const member = await ManagersMember.findById(tx.memberId).lean();
        if (!member) throw new Error('Member not found');

        console.log('Member found:', member.name || member.fullName);

        const manager = await BranchManager.findOne({ branchId: tx.branchId }).lean();
        const officer = manager ? {
            name: manager.fullName,
            userId: manager.userId,
            phone: manager.phone,
            area: manager.branchName,
            role: 'Manager'
        } : {};

        console.log('Officer details:', officer.name);

        console.log('Testing PDF generation...');
        const pdfUrl = await generateBillPDF(tx, member, officer);
        console.log('PDF URL:', pdfUrl);

        await mongoose.connection.close();
    } catch (err) {
        console.error('TEST ERROR:', err);
    }
};

testPDFAndMember();
