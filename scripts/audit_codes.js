const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });

const audit = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming');

        const BranchManager = require('../models/BranchManager');

        const managers = await BranchManager.find({}, 'branchId branchName userId').lean();
        let mapping = '--- Branch ID to Code Mapping ---\n';

        managers.forEach(m => {
            const parts = m.userId.split('-');
            const code = parts.length >= 2 ? parts[1] : '??';
            mapping += `- Branch: ${m.branchName} | ID: ${m.branchId} | Code: ${code}\n`;
        });

        fs.writeFileSync('branch_mapping.txt', mapping);
        console.log('Mapping saved.');
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

audit();
