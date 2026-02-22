const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

const ManagersMember = require('../models/ManagersMember');
const ExtraMember = require('../models/ExtraMember');

async function migrateMembers() {
    try {
        console.log('Starting migration from ManagersMember to ExtraMember...');

        // Get all members from ManagersMember collection
        const oldMembers = await ManagersMember.find({});
        console.log(`Found ${oldMembers.length} members in ManagersMember collection`);

        if (oldMembers.length === 0) {
            console.log('No members to migrate');
            return;
        }

        let migrated = 0;
        let skipped = 0;

        for (const member of oldMembers) {
            // Check if already exists in ExtraMember
            const exists = await ExtraMember.findOne({
                $or: [
                    { mobile: member.mobile },
                    { nic: member.nic }
                ]
            });

            if (exists) {
                console.log(`Skipping ${member.name} - already exists in ExtraMember`);
                skipped++;
                continue;
            }

            // Create new ExtraMember document
            const newMember = new ExtraMember({
                name: member.name,
                address: member.address,
                mobile: member.mobile,
                email: member.email,
                nic: member.nic,
                collectedBy: member.addedBy,  // Map addedBy to collectedBy
                collectedAt: member.createdAt || new Date()  // Map createdAt to collectedAt
            });

            await newMember.save();
            console.log(`Migrated: ${member.name}`);
            migrated++;
        }

        console.log('\n=== Migration Summary ===');
        console.log(`Total found: ${oldMembers.length}`);
        console.log(`Migrated: ${migrated}`);
        console.log(`Skipped (already exists): ${skipped}`);
        console.log('\nMigration complete!');

        // Optionally delete old records (commented out for safety)
        // console.log('\nDeleting old ManagersMember records...');
        // await ManagersMember.deleteMany({});
        // console.log('Old records deleted');

    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        mongoose.connection.close();
    }
}

migrateMembers();
