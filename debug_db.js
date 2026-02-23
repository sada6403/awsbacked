const mongoose = require('mongoose');
require('dotenv').config();

const ManagersMember = require('./models/ManagersMember');

async function debug() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const managerMembers = await ManagersMember.find({}).limit(5);
        console.log('ManagersMember count:', managerMembers.length);

        managerMembers.forEach((m, i) => {
            console.log(`Member ${i}:`, {
                name: m.name,
                addedBy: m.addedBy,
                addedByType: typeof m.addedBy,
                isObjectId: m.addedBy instanceof mongoose.Types.ObjectId,
                addedByString: m.addedBy?.toString()
            });
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
