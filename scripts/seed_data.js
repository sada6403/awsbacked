require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const BranchManager = require('../models/BranchManager');
const FieldVisitor = require('../models/FieldVisitor');
const Member = require('../models/Member');
const ExtraMember = require('../models/ExtraMember');
const ManagersMember = require('../models/ManagersMember');

const MONGODB_URI = process.env.MONGODB_URI;

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to Atlas for seeding...');

        // 1. Create Branch Manager
        console.log('Seeding Manager...');
        const managerData = {
            fullName: 'Branch Manager One',
            email: 'manager1@naturefarming.com',
            phone: '0712345678',
            branchName: 'Kalmunai',
            branchId: 'KA001',
            userId: 'manager1',
            password: 'password123',
            role: 'manager',
            status: 'active'
        };
        const manager = await BranchManager.findOneAndUpdate(
            { userId: managerData.userId },
            managerData,
            { upsert: true, new: true }
        );

        // 2. Create Field Visitor
        console.log('Seeding Field Visitor...');
        const visitorData = {
            name: 'Field Visitor One',
            userId: 'fv1',
            phone: '0711111111',
            email: 'fv1@naturefarming.com',
            password: 'password123',
            managerId: manager._id,
            branchId: manager.branchId,
            area: 'Kalmunai North',
            status: 'active'
        };
        const visitor = await FieldVisitor.findOneAndUpdate(
            { userId: visitorData.userId },
            visitorData,
            { upsert: true, new: true }
        );

        // 3. Create Member (Under FV)
        console.log('Seeding Member...');
        const memberData = {
            name: 'Member One',
            address: '123 Main St, Kalmunai',
            mobile: '0722222222',
            nic: '199012345V',
            memberCode: 'FAKA001',
            fieldVisitorId: visitor._id,
            branchId: visitor.branchId,
            memberType: 'New',
            registrationFeePaid: true
        };
        await Member.findOneAndUpdate(
            { nic: memberData.nic },
            memberData,
            { upsert: true, new: true }
        );

        // 4. Create Extra Member / Lead (Under FV)
        console.log('Seeding Extra Member (Lead)...');
        const extraData = {
            name: 'Lead One',
            address: '456 Side St, Kalmunai',
            mobile: '0733333333',
            nic: '199512345V',
            collectedBy: visitor._id,
            notes: 'Interested in aloevera'
        };
        await ExtraMember.findOneAndUpdate(
            { mobile: extraData.mobile },
            extraData,
            { upsert: true, new: true }
        );

        // 5. Create Managers Member (Under Manager)
        console.log('Seeding Managers Member (Direct)...');
        const mMemberData = {
            name: 'Manager Member One',
            address: '789 Branch St, Kalmunai',
            mobile: '0744444444',
            nic: '198512345V',
            addedBy: manager._id
        };
        await ManagersMember.findOneAndUpdate(
            { mobile: mMemberData.mobile },
            mMemberData,
            { upsert: true, new: true }
        );

        console.log('\nSeeding completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
}

seed();
