const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const BranchManager = require('./models/BranchManager');
const FieldVisitor = require('./models/FieldVisitor');
const Member = require('./models/Member');
const ExtraMember = require('./models/ExtraMember');
const ManagersMember = require('./models/ManagersMember');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nf-farming');
        console.log('Connected to DB');

        // Find John Ramalingam
        const visitor = await FieldVisitor.findOne({ name: /jhon/i }) || await FieldVisitor.findOne({ name: /ramalingam/i });

        if (visitor) {
            console.log('--- Field Visitor (John) ---');
            console.log(`ID: ${visitor._id}`);
            console.log(`Name: ${visitor.name}`);
            console.log(`BranchId: ${visitor.branchId}`);

            const visitorOid = visitor._id;

            // Search in Member
            const members = await Member.find({
                $or: [
                    { fieldVisitorId: visitorOid },
                    { branchId: visitor.branchId }
                ]
            }).limit(5).lean();
            console.log(`--- "Member" collection matches: ${members.length} ---`);
            members.forEach(m => console.log(`- ${m.name || m.fullName} (Branch: ${m.branchId})`));

            // Search in ExtraMember
            const extra = await ExtraMember.find({
                $or: [
                    { collectedBy: visitorOid },
                    { branchId: visitor.branchId }
                ]
            }).limit(5).lean();
            console.log(`--- "ExtraMember" collection matches: ${extra.length} ---`);
            extra.forEach(m => console.log(`- ${m.name} (Branch: ${m.branchId})`));

            // Search in ManagersMember
            const mgr = await ManagersMember.find({
                $or: [
                    { addedBy: visitorOid },
                    { branchId: visitor.branchId }
                ]
            }).limit(5).lean();
            console.log(`--- "ManagersMember" collection matches: ${mgr.length} ---`);
            mgr.forEach(m => console.log(`- ${m.name} (Branch: ${m.branchId})`));

        } else {
            console.log('Field Visitor "Jhon Ramalingam" not found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
