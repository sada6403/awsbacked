require('dotenv').config();
const mongoose = require('mongoose');

// Import all models to ensure they are registered with Mongoose
const Member = require('../models/Member');
const ExtraMember = require('../models/ExtraMember');
const ManagersMember = require('../models/ManagersMember');
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const RequestLog = require('../models/RequestLog');
const Notification = require('../models/Notification');
const Note = require('../models/Note');
const Otp = require('../models/Otp');
const WalletRequest = require('../models/WalletRequest');

const MONGODB_URI = process.env.MONGODB_URI;

async function initialize() {
    if (!MONGODB_URI) {
        console.error('Error: MONGODB_URI not found in .env');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully!');

        const models = [
            { name: 'Member', model: Member },
            { name: 'ExtraMember', model: ExtraMember },
            { name: 'ManagersMember', model: ManagersMember },
            { name: 'BranchManager', model: BranchManager },
            { name: 'FieldVisitor', model: FieldVisitor },
            { name: 'Product', model: Product },
            { name: 'Transaction', model: Transaction },
            { name: 'RequestLog', model: RequestLog },
            { name: 'Notification', model: Notification },
            { name: 'Note', model: Note },
            { name: 'Otp', model: Otp },
            { name: 'WalletRequest', model: WalletRequest }
        ];

        console.log('\n--- Initializing Collections ---');
        for (const item of models) {
            try {
                // Creating a collection explicitly ensures indices are built
                await item.model.createCollection();
                console.log(`[OK] Collection created/verified: ${item.name}`);
            } catch (err) {
                console.log(`[INFO] Collection ${item.name} already exists or error: ${err.message}`);
            }
        }

        // Check if any users exist, if not, create a placeholder manager?
        // Actually, maybe not wise to auto-create users without user request.
        // But I will at least check.
        const managerCount = await BranchManager.countDocuments();
        const visitorCount = await FieldVisitor.countDocuments();

        console.log(`\n--- Status ---`);
        console.log(`Managers: ${managerCount}`);
        console.log(`Field Visitors: ${visitorCount}`);

        if (managerCount === 0) {
            console.log('\n[WARNING] No Managers found. You may need to create one to log in.');
        }

        console.log('\nDatabase initialization completed!');
        process.exit(0);

    } catch (error) {
        console.error('Initialization failed:', error);
        process.exit(1);
    }
}

initialize();
