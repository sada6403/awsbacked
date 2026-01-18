require('dotenv').config();
const mongoose = require('mongoose');
const FieldVisitor = require('./models/FieldVisitor');

const seedUser = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming');
        console.log('Connected to MongoDB...');

        const userId = 'FV-KM-001'; // Matches screenshot
        const rawPassword = 'password123';

        let user = await FieldVisitor.findOne({ userId });

        if (user) {
            console.log(`User ${userId} exists. Updating password...`);
            user.password = rawPassword;
            await user.save();
        } else {
            console.log(`Creating user ${userId}...`);
            user = new FieldVisitor({
                userId: userId,
                name: 'Field Visitor KM',
                fullName: 'Field Visitor KM Local',
                phone: '0771234567',
                password: rawPassword,
                branchId: 'branch-KM-001',
                role: 'field_visitor',
                status: 'active'
            });
            await user.save();
        }
        console.log(`SUCCESS: User ${userId} is ready with password: ${rawPassword}`);
        mongoose.connection.close();
    } catch (e) {
        console.error('Error:', e);
    }
};

seedUser();
