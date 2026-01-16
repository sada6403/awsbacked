// seed-field-visitor.js
require('dotenv').config();
const mongoose = require('mongoose');
const FieldVisitor = require('./models/FieldVisitor');

const seedFieldVisitor = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected');

        // Check if FV-KM-001 already exists
        const existing = await FieldVisitor.findOne({ userId: 'FV-KM-001' });
        if (existing) {
            console.log('✅ Field Visitor FV-KM-001 already exists');
            process.exit(0);
        }

        // Create FV-KM-001 with password: password123
        const fieldVisitor = new FieldVisitor({
            name: 'Kamal Silva',
            fullName: 'Kamal Silva',
            userId: 'FV-KM-001',
            phone: '0771234567',
            password: 'password123', // Will be hashed by pre-save hook
            code: 'FV-KM-001',
            branchId: 'branch-kalmunai',
            status: 'active'
        });

        await fieldVisitor.save();
        console.log('✅ Field Visitor FV-KM-001 created successfully');
        console.log('   UserId: FV-KM-001');
        console.log('   Password: password123');
        console.log('   Name: Kamal Silva');
        console.log('   Branch: branch-kalmunai');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding field visitor:', error.message);
        process.exit(1);
    }
};

seedFieldVisitor();
