const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkBalances = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.log('MONGODB_URI not found in .env');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const FieldVisitor = require('./models/FieldVisitor');
        const BranchManager = require('./models/BranchManager');
        const ManagersMember = require('./models/ManagersMember');

        const fvs = await FieldVisitor.find({}).select('name walletBalance branchId userId').lean();
        const managers = await BranchManager.find({}).select('fullName walletBalance branchId userId').lean();

        console.log('--- Field Visitors ---');
        fvs.forEach(fv => {
            console.log(`Name: ${fv.name}, Balance: ${fv.walletBalance}, ID: ${fv._id}, UserID: ${fv.userId}`);
        });

        console.log('--- Branch Managers ---');
        managers.forEach(mg => {
            console.log(`Name: ${mg.fullName}, Balance: ${mg.walletBalance}, ID: ${mg._id}, UserID: ${mg.userId}`);
        });

        const mobile = '0743469972';
        const mgrMember = await ManagersMember.findOne({ mobile });

        console.log('--- Member Search (sabi) ---');
        if (mgrMember) {
            console.log(`Found sabi in ManagersMember. ID: ${mgrMember._id}, Name: ${mgrMember.fullName || mgrMember.name}, Branch: ${mgrMember.branchId}`);
        } else {
            console.log('sabi NOT found in ManagersMember');
        }

        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkBalances();
