// seed-with-areas.js
// Comprehensive seeding with area-based filtering and proper transaction data

require('dotenv').config();
const mongoose = require('mongoose');
const BranchManager = require('./models/BranchManager');
const FieldVisitor = require('./models/FieldVisitor');
const Member = require('./models/Member');
const Transaction = require('./models/Transaction');
const Product = require('./models/Product');

// Branch and Area Configuration
const branches = [
    { name: 'Kalmunai', id: 'branch-kalmunai', code: 'KM', area: 'Kalmunai' },
    { name: 'Jaffna (Kondavil)', id: 'branch-jaffna-kondavil', code: 'JK', area: 'Jaffna-Kondavil' },
    { name: 'Jaffna (Savagacheri)', id: 'branch-jaffna-savagacheri', code: 'JS', area: 'Jaffna-Savagacheri' },
    { name: 'Trincomalee', id: 'branch-trincomalee', code: 'TR', area: 'Trincomalee' },
];

const srilankanFirstNames = [
    'Chathura', 'Roshan', 'Kumara', 'Sampath', 'Jayantha',
    'Ravi', 'Pradeep', 'Kalana', 'Nirmala', 'Shanika',
    'Lakshmi', 'Dilini', 'Amarasena', 'Priya', 'Suresh'
];

const srilankanLastNames = [
    'Silva', 'Fernando', 'Perera', 'Jayasekara', 'Wimalaweera',
    'Dassanayake', 'Bandara', 'Sinhalage', 'Wijesinghe', 'Dissanayake'
];

const productNames = ['Rice', 'Coconut Oil', 'Rubber', 'Tea', 'Cinnamon', 'Black Pepper', 'Cardamom', 'Arecanut'];
const unitTypes = ['Kg', 'g', 'number'];

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomName() {
    const first = getRandomElement(srilankanFirstNames);
    const last = getRandomElement(srilankanLastNames);
    return `${first} ${last}`;
}

function generateEmail(name) {
    const sanitized = name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
    const random = Math.floor(Math.random() * 1000);
    return `${sanitized}${random}@nature-farming.com`;
}

function generateRandomSrilankanPhone() {
    const prefixes = ['070', '071', '072', '074', '075', '076', '077', '078'];
    const prefix = getRandomElement(prefixes);
    const remaining = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    return prefix + remaining;
}

async function generateBillNumber(type) {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await Transaction.countDocuments({
        date: { $gte: startOfDay, $lte: endOfDay }
    });

    const sequence = (count + 1).toString().padStart(5, '0');
    return `NF-${type[0]}-${dateStr}-${sequence}`;
}

async function seedDatabase() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Drop database
        console.log('🗑️  Dropping database...');
        await mongoose.connection.db.dropDatabase();
        console.log('✅ Database dropped');

        // Ensure Product collection exists with sample products
        const products = [];
        for (const name of productNames) {
            const product = new Product({
                productId: `PROD-${Date.now()}-${Math.random()}`,
                name,
                defaultPrice: Math.floor(Math.random() * 10000) + 1000,
                unit: getRandomElement(unitTypes)
            });
            products.push(await product.save());
        }
        console.log(`✅ Created ${products.length} products`);

        // Create Branch Managers
        console.log('\n📋 Creating Branch Managers...');
        const managers = [];

        for (const branch of branches) {
            const managerName = getRandomName();
            const manager = new BranchManager({
                fullName: managerName,
                email: generateEmail(managerName),
                phone: generateRandomSrilankanPhone(),
                branchName: branch.name,
                branchId: branch.id,
                userId: `MGR-${branch.code}-001`,
                password: 'password123',
                role: 'branch_manager',
                status: 'active',
            });

            await manager.save();
            managers.push(manager);
            console.log(`  ✅ ${managerName} (${branch.name})`);
        }

        // Create Field Visitors with area assignment
        console.log('\n👥 Creating Field Visitors...');
        const fieldVisitors = [];

        for (let mIdx = 0; mIdx < managers.length; mIdx++) {
            const manager = managers[mIdx];
            const branch = branches[mIdx];

            // Create 3 field visitors per branch for testing
            for (let fvIdx = 1; fvIdx <= 3; fvIdx++) {
                const fvName = getRandomName();
                const fieldVisitor = new FieldVisitor({
                    name: fvName,
                    fullName: fvName,
                    userId: `FV-${branch.code}-${fvIdx.toString().padStart(3, '0')}`,
                    phone: generateRandomSrilankanPhone(),
                    password: 'password123',
                    code: `FV${branch.code}${fvIdx}`,
                    managerId: manager._id,
                    branchId: branch.id,
                    area: branch.area, // Assign area based on branch
                    status: 'active',
                });

                await fieldVisitor.save();
                fieldVisitors.push({
                    doc: fieldVisitor,
                    branchName: branch.name,
                    branchId: branch.id,
                    branchCode: branch.code,
                    area: branch.area
                });

                console.log(`  ✅ ${fvName} (${branch.name}) - ID: ${fieldVisitor.userId}, Area: ${branch.area}`);
            }
        }

        // Create Members with area assignment (matching FV area)
        console.log('\n👨‍🌾 Creating Members...');
        const members = [];
        const membersByFV = new Map();

        for (const fvWrapper of fieldVisitors) {
            const fv = fvWrapper.doc;
            const area = fvWrapper.area;
            
            // Create 5 members per field visitor
            const fvMembers = [];
            for (let mIdx = 0; mIdx < 5; mIdx++) {
                const memberName = getRandomName();
                const member = new Member({
                    name: memberName,
                    address: `${100 + mIdx} ${area} Road, ${fvWrapper.branchName}`,
                    mobile: generateRandomSrilankanPhone(),
                    nic: `199${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}${Math.floor(Math.random() * 10)}V`,
                    memberCode: `MEM-${fvWrapper.branchCode}-${fv._id.toString().slice(-4)}-${mIdx}`,
                    fieldVisitorId: fv._id,
                    branchId: fvWrapper.branchId,
                    area: area // Member area must match FV area
                });

                await member.save();
                members.push(member);
                fvMembers.push(member);
            }
            membersByFV.set(fv._id.toString(), fvMembers);
        }
        console.log(`✅ Created ${members.length} members`);

        // Create Transactions - ensure each FV and Member has transactions
        console.log('\n💰 Creating Transactions...');
        let transactionCount = 0;

        for (const fvWrapper of fieldVisitors) {
            const fv = fvWrapper.doc;
            const fvMembers = membersByFV.get(fv._id.toString());

            // Ensure this FV has at least 1 BUY and 1 SELL transaction
            const types = ['buy', 'sell'];
            
            for (const type of types) {
                const member = fvMembers[0]; // Use first member
                const product = getRandomElement(products);
                const quantity = Math.floor(Math.random() * 100) + 10;
                const unitPrice = Math.floor(Math.random() * 5000) + 500;

                const transaction = new Transaction({
                    billNumber: await generateBillNumber(type),
                    type,
                    memberId: member._id,
                    fieldVisitorId: fv._id,
                    productName: product.name,
                    quantity,
                    unitType: getRandomElement(unitTypes),
                    unitPrice,
                    totalAmount: quantity * unitPrice,
                    branchId: fvWrapper.branchId,
                    date: new Date()
                });

                await transaction.save();
                transactionCount++;
            }

            // Create additional transactions for other members
            for (let mIdx = 1; mIdx < fvMembers.length; mIdx++) {
                const member = fvMembers[mIdx];
                const type = Math.random() > 0.5 ? 'buy' : 'sell';
                const product = getRandomElement(products);
                const quantity = Math.floor(Math.random() * 100) + 10;
                const unitPrice = Math.floor(Math.random() * 5000) + 500;

                const transaction = new Transaction({
                    billNumber: await generateBillNumber(type),
                    type,
                    memberId: member._id,
                    fieldVisitorId: fv._id,
                    productName: product.name,
                    quantity,
                    unitType: getRandomElement(unitTypes),
                    unitPrice,
                    totalAmount: quantity * unitPrice,
                    branchId: fvWrapper.branchId,
                    date: new Date()
                });

                await transaction.save();
                transactionCount++;
            }
        }
        console.log(`✅ Created ${transactionCount} transactions`);

        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ SEEDING COMPLETED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`
📊 Summary:
  • Branches: ${branches.length}
  • Branch Managers: ${managers.length}
  • Field Visitors: ${fieldVisitors.length}
  • Members: ${members.length}
  • Transactions: ${transactionCount}
  • Products: ${products.length}

🔐 Test Credentials:
  Field Visitor: FV-KM-001 / password123
  Field Visitor: FV-KM-002 / password123
  Field Visitor: FV-KM-003 / password123

📍 Data Structure:
  • Each Field Visitor is assigned to specific area (Kalmunai, Jaffna-Kondavil, Jaffna-Savagacheri, Trincomalee)
  • Each Member is assigned to same area as their Field Visitor
  • Each Field Visitor has at least 1 BUY and 1 SELL transaction
  • Each Member has at least 1 transaction

🎯 Area-Based Filtering:
  • FV-KM-* can only see members in "Kalmunai" area
  • FV-JK-* can only see members in "Jaffna-Kondavil" area
  • FV-JS-* can only see members in "Jaffna-Savagacheri" area
  • FV-TR-* can only see members in "Trincomalee" area
        `);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error.message);
        console.error(error);
        process.exit(1);
    }
}

seedDatabase();
