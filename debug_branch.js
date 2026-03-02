const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config();

const BranchManager = require('./models/BranchManager');
const Member = require('./models/Member');
const ExtraMember = require('./models/ExtraMember');
const ManagersMember = require('./models/ManagersMember');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nf-farming');
        console.log('Connected to DB');

        // Find the member from the screenshot: "sabi"
        const member = await ManagersMember.findOne({ name: /sabi/i }) ||
            await Member.findOne({ name: /sabi/i }) ||
            await ExtraMember.findOne({ name: /sabi/i });

        if (member) {
            console.log('--- Member Found ---');
            console.log(`ID: ${member._id}`);
            console.log(`Name: ${member.name}`);
            console.log(`BranchId: ${member.branchId}`);
            console.log(`AddedBy/CollectedBy: ${member.addedBy || member.collectedBy}`);

            const ownerId = member.addedBy || member.collectedBy;
            if (ownerId) {
                const manager = await BranchManager.findById(ownerId);
                const visitor = await FieldVisitor.findById(ownerId); // Removed local require as it's global now

                if (manager) {
                    console.log('--- Manager (Owner) ---');
                    console.log(`ID: ${manager._id}`);
                    console.log(`BranchName: ${manager.fullName}`); // Changed to fullName as per BranchManager model
                    console.log(`BranchId: ${manager.branchId}`);
                }
                if (visitor) {
                    console.log('--- FieldVisitor (Owner) ---');
                    console.log(`ID: ${visitor._id}`);
                    console.log(`Name: ${visitor.name}`); // Added name for FieldVisitor
                    console.log(`BranchId: ${visitor.branchId}`);
                }
                if (!manager && !visitor) {
                    console.log(`--- Owner with ID ${ownerId} not found as Manager or FieldVisitor ---`);
                }
            } else {
                console.log('--- Member has no owner (addedBy/collectedBy) field ---');
            }
        } else {
            console.log('Member "sabi" not found');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
