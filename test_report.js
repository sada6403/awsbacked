const mongoose = require('mongoose');
require('dotenv').config();

const ManagersMember = require('./models/ManagersMember');
const ExtraMember = require('./models/ExtraMember');
const BranchManager = require('./models/BranchManager');

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const manager = await BranchManager.findOne({});
        if (!manager) {
            console.log('No manager found');
            process.exit(0);
        }
        const userId = manager._id.toString();
        const userOid = new mongoose.Types.ObjectId(userId);
        console.log('Testing for Manager ID:', userId);

        const [mgrMembers, extMembers] = await Promise.all([
            ManagersMember.find({ addedBy: userOid }).sort({ createdAt: -1 }).limit(10).lean(),
            ExtraMember.find({ collectedBy: userOid }).sort({ collectedAt: -1 }).limit(10).lean()
        ]);

        console.log('ManagersMember found:', mgrMembers.length);
        console.log('ExtraMember found:', extMembers.length);

        const recentMembers = [...mgrMembers, ...extMembers]
            .sort((a, b) => {
                const dateA = a.createdAt || a.collectedAt || 0;
                const dateB = b.createdAt || b.collectedAt || 0;
                return new Date(dateB) - new Date(dateA);
            })
            .slice(0, 10);

        console.log('Merged Recent Members:', JSON.stringify(recentMembers, null, 2));

        const count1 = await ManagersMember.countDocuments({ addedBy: userOid });
        const count2 = await ExtraMember.countDocuments({ collectedBy: userOid, memberCode: { $ne: null, $ne: '' } });
        console.log('Counts:', { managersMember: count1, extraMemberWithCode: count2, total: count1 + count2 });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
