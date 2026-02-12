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
