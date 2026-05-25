require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const { uploadBase64Image } = require('../services/s3Service');

const Member = require('../models/Member');
const ExtraMember = require('../models/ExtraMember');
const ManagersMember = require('../models/ManagersMember');
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const WalletTransaction = require('../models/WalletTransaction');

const URI = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI;

// Check if string looks like base64 data URI
const isBase64 = (str) => {
    if (typeof str !== 'string') return false;
    return str.startsWith('data:image/') || (str.length > 500 && !str.startsWith('http'));
};

async function migrateModel(Model, fields, folderName) {
    if (!Model) return;
    console.log(`\n--- Migrating ${Model.modelName} ---`);
    // Find all documents
    const docs = await Model.find({});
    let updatedCount = 0;

    for (const doc of docs) {
        let isUpdated = false;
        
        for (const field of fields) {
            const value = doc.get(field);
            if (value && isBase64(value)) {
                console.log(`[${Model.modelName}] [${doc._id}] Migrating ${field}...`);
                try {
                    // Upload to S3
                    const s3Url = await uploadBase64Image(value, folderName);
                    // Update document natively if Mongoose set doesn't work easily
                    doc.set(field, s3Url);
                    isUpdated = true;
                } catch (error) {
                    console.error(`[${Model.modelName}] [${doc._id}] Failed to migrate ${field}:`, error.message);
                }
            }
        }

        if (isUpdated) {
            // Save modified doc bypassing some strict validators if any (usually ok for just strings)
            await doc.save({ validateModifiedOnly: true });
            updatedCount++;
            console.log(`[${Model.modelName}] [${doc._id}] Saved successfully.`);
        }
    }
    console.log(`Finished ${Model.modelName}: Updated ${updatedCount} documents.`);
}

async function run() {
    try {
        if (!URI) {
            console.error('MONGO_URI is missing from .env');
            process.exit(1);
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(URI);
        console.log('Connected successfully. Starting migration...');

        const commonImageFields = ['profileImage', 'idFrontImage', 'idBackImage', 'signatureImage'];

        await migrateModel(Member, commonImageFields, 'profile');
        await migrateModel(ExtraMember, commonImageFields, 'ids');
        await migrateModel(ManagersMember, commonImageFields, 'ids');
        await migrateModel(BranchManager, ['profileImage'], 'profile');
        await migrateModel(FieldVisitor, ['profileImage'], 'profile');
        await migrateModel(WalletTransaction, ['receiptUrl'], 'receipts');

        console.log('\n=========================================');
        console.log('        MIGRATION COMPLETE');
        console.log('=========================================');
        process.exit(0);
    } catch (e) {
        console.error('Migration failed with critical error:', e);
        process.exit(1);
    }
}

run();
