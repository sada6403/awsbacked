const mongoose = require('mongoose');
require('dotenv').config();

const ManagersMember = require('./models/ManagersMember');
const ExtraMember = require('./models/ExtraMember');
const BranchManager = require('./models/BranchManager');

async function audit() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const managers = await BranchManager.find({}).lean();

        for (const m of managers) {
            const userOid = m._id;
            const countMM = await ManagersMember.countDocuments({ addedBy: userOid });
            const countEM = await ExtraMember.countDocuments({ collectedBy: userOid });

            if (countMM > 0 || countEM > 0) {
                console.log(`MANAGER: ${m.fullName} | UserId: ${m.userId} | _id: ${m._id}`);
                console.log(`  ManagersMember (New Flow): ${countMM}`);
                console.log(`  ExtraMember (Legacy Flow): ${countEM}`);

                if (countMM > 0) {
                    const sample = await ManagersMember.findOne({ addedBy: userOid });
                    console.log(`  Sample ManagersMember addedBy field: ${sample.addedBy} (Type: ${typeof sample.addedBy})`);
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
audit();
