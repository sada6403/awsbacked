<<<<<<< HEAD
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const cleanup = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nf_farming');

        const Member = require('../models/Member');
        const FieldVisitor = require('../models/FieldVisitor');

        console.log('Cleaning duplicates...');

        // Function to remove duplicates based on a field
        const removeDuplicates = async (Model, fieldName) => {
            const duplicates = await Model.aggregate([
                { $group: { _id: `$${fieldName}`, count: { $sum: 1 }, docs: { $push: "$_id" } } },
                { $match: { count: { $gt: 1 } } }
            ]);

            console.log(`Found ${duplicates.length} sets of duplicates for ${Model.modelName} on ${fieldName}`);

            for (const dup of duplicates) {
                // Keep the first one, delete the rest
                const toDelete = dup.docs.slice(1);
                console.log(`Deleting ${toDelete.length} duplicates for ${fieldName}: ${dup._id}`);
                await Model.deleteMany({ _id: { $in: toDelete } });
            }
        };

        // Clean Member duplicates
        await removeDuplicates(Member, 'mobile');
        await removeDuplicates(Member, 'nic');

        // Clean FieldVisitor duplicates
        await removeDuplicates(FieldVisitor, 'phone');
        await removeDuplicates(FieldVisitor, 'nic');

        console.log('Cleanup finished.');
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

cleanup();
=======
require('dotenv').config();
const mongoose = require('mongoose');
const Member = require('../models/Member');
const ExtraMember = require('../models/ExtraMember');
const ManagersMember = require('../models/ManagersMember');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming';

const dryRun = process.argv.includes('--dry-run');

async function cleanupCollection(Model, modelName, uniqueField) {
    console.log(`\n--- Cleaning Up ${modelName} by ${uniqueField} ---`);

    // 1. Normalize fields first
    const items = await Model.find({});
    for (let item of items) {
        let changed = false;
        if (item.nic) {
            const normalizedNic = item.nic.trim().toUpperCase();
            if (item.nic !== normalizedNic) {
                item.nic = normalizedNic;
                changed = true;
            }
        }
        if (item.mobile) {
            const normalizedMobile = item.mobile.replace(/\s+/g, '');
            if (item.mobile !== normalizedMobile) {
                item.mobile = normalizedMobile;
                changed = true;
            }
        }
        if (changed && !dryRun) {
            await item.save();
        }
    }

    // 2. Find duplicates
    const duplicates = await Model.aggregate([
        {
            $group: {
                _id: `$${uniqueField}`,
                count: { $sum: 1 },
                ids: { $push: "$_id" }
            }
        },
        {
            $match: {
                count: { $gt: 1 },
                _id: { $ne: null, $ne: "" }
            }
        }
    ]);

    console.log(`Found ${duplicates.length} duplicate groups for ${uniqueField}`);

    let totalDeleted = 0;
    for (let group of duplicates) {
        // Keep the latest one (sorted by _id)
        const sortedIds = group.ids.sort((a, b) => b.toString().localeCompare(a.toString()));
        const toKeep = sortedIds[0];
        const toDeleteSize = sortedIds.slice(1);

        console.log(`Group ${group._id}: Keeping ${toKeep}, deleting ${toDeleteSize.length} records`);

        if (!dryRun) {
            const result = await Model.deleteMany({ _id: { $in: toDeleteSize } });
            totalDeleted += result.deletedCount;
        } else {
            totalDeleted += toDeleteSize.length;
        }
    }

    console.log(`Total ${modelName} deleted by ${uniqueField}: ${totalDeleted} ${dryRun ? '(Dry Run)' : ''}`);
}

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB for cleanup');

        // Cleanup Member
        await cleanupCollection(Member, 'Member', 'nic');
        await cleanupCollection(Member, 'Member', 'mobile');

        // Cleanup ExtraMember
        await cleanupCollection(ExtraMember, 'ExtraMember', 'nic');
        await cleanupCollection(ExtraMember, 'ExtraMember', 'mobile');

        // Cleanup ManagersMember
        await cleanupCollection(ManagersMember, 'ManagersMember', 'mobile');
        if (ManagersMember.schema.path('nic')) {
            await cleanupCollection(ManagersMember, 'ManagersMember', 'nic');
        }

        console.log('\nCleanup completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Cleanup Error:', error);
        process.exit(1);
    }
}

run();
>>>>>>> a527a77 (Update backend with company transfer logic and error handling)
