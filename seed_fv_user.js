require('dotenv').config();
const mongoose = require('mongoose');
const FieldVisitor = require('./models/FieldVisitor');
const BranchManager = require('./models/BranchManager'); // Populate reference if needed

const seedUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming');
        console.log('Connected to MongoDB...');

        const userId = 'FV-JS-001';
        const rawPassword = 'password123';

        // Check if exists
        let user = await FieldVisitor.findOne({ userId });

        if (user) {
            console.log(`User ${userId} exists. Updating password...`);
            user.password = rawPassword; // Pre-save hook will hash this
            await user.save();
            console.log('Password updated successfully.');
        } else {
            console.log(`Creating user ${userId}...`);
            // Create minimal user
            user = new FieldVisitor({
                userId: userId,
                name: 'Field Visitor Local',
                fullName: 'Field Visitor Local Account',
                phone: '0771234567',
                password: rawPassword, // Pre-save hook will hash this
                branchId: 'branch-KM-001', // Example branch
                role: 'field_visitor',
                status: 'active'
            });
            await user.save();
            console.log('User created successfully.');
        }

        mongoose.connection.close();
    } catch (e) {
        console.error('Error seeding user:', e);
    }
};

seedUser();
