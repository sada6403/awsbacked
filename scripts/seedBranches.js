/**
 * seedBranches.js
 * Migration script to populate the new Branch collection from hardcoded enum data.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/Branch');

const INITIAL_BRANCHES = [
    { name: 'Kalmunai', code: 'KM', address: 'Main St, Kalmunai', phone: '0671234567' },
    { name: 'Jaffna (Kondavil)', code: 'JK', address: 'Kondavil, Jaffna', phone: '0211234567' },
    { name: 'Jaffna (Savagacheri)', code: 'JS', address: 'Savagacheri, Jaffna', phone: '0211234568' },
    { name: 'Jaffna (Chavakachcheri)', code: 'JC', address: 'Chavakachcheri, Jaffna', phone: '0211234569' },
    { name: 'Trincomalee', code: 'TR', address: 'Main St, Trincomalee', phone: '0261234567' },
    { name: 'Jaffna', code: 'JA', address: 'Jaffna Town', phone: '0211234560' },
    { name: 'Mannar', code: 'MN', address: 'Mannar Town', phone: '0231234567' },
    { name: 'Ampara', code: 'AM', address: 'Ampara Town', phone: '0631234567' },
    { name: 'Kandawalai', code: 'KA', address: 'Kandawalai, Jaffna', phone: '0219999999' }
];

const seedBranches = async () => {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf_farming';
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Drop existing collection to clear stale indices
        try {
            await mongoose.connection.db.dropCollection('branches');
            console.log('Existing branches collection dropped.');
        } catch (e) {
            console.log('No existing branches collection to drop.');
        }

        for (const b of INITIAL_BRANCHES) {
            const exists = await Branch.findOne({ branchCode: b.code });
            if (!exists) {
                await Branch.create({
                    branchName: b.name,
                    branchCode: b.code,
                    address: b.address,
                    phone: b.phone,
                    status: 'active'
                });
                console.log(`Created branch: ${b.name} (${b.code})`);
            } else {
                console.log(`Branch exists: ${b.name}`);
            }
        }

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seedBranches();
