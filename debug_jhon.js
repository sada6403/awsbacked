const mongoose = require('mongoose');
const Member = require('./models/Member');
const ExtraMember = require('./models/ExtraMember');
const FieldVisitor = require('./models/FieldVisitor');
const BranchManager = require('./models/BranchManager');
require('dotenv').config();

async function debugJhon() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const userId = '6978bcb12f5c5781b4bc27fb';
        const user = await FieldVisitor.findById(userId) || await BranchManager.findById(userId);

        if (!user) {
            console.log('User JHONE RAMALINGAM not found by ID.');
            return;
        }

        const role = user.constructor.modelName;
        console.log(`Found User: ${user.name} | Role: ${role} | _id: ${user._id}`);

        // Check for members assigned to this ID
        const memberCount = await Member.countDocuments({ fieldVisitorId: user._id });
        const extraMemberCount = await ExtraMember.countDocuments({ collectedBy: user._id });
        const branchMemberCount = await Member.countDocuments({ branchId: user.branchId });

        console.log(`Member Count (by fieldVisitorId): ${memberCount}`);
        console.log(`ExtraMember Count (by collectedBy): ${extraMemberCount}`);
        console.log(`Members Count (by branchId): ${branchMemberCount}`);

        // Sample members
        const sampleMembers = await Member.find({ fieldVisitorId: user._id }).limit(5).select('name mobile fieldVisitorId');
        console.log('Sample Members:', sampleMembers);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

debugJhon();
