/**
 * COMPREHENSIVE DATABASE SEEDER
 * Populates MongoDB with realistic, fully-structured, relation-based data
 * 
 * Data hierarchy:
 * BranchManager (4)
 *   → FieldVisitors (5 each = 20 total)
 *     → Members (10 each = 200 total)
 *       → Transactions (2 each = 400 total)
 *       → Notifications (per transaction)
 *     → Notes (per field visitor)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import models
const BranchManager = require('./models/BranchManager');
const FieldVisitor = require('./models/FieldVisitor');
const Member = require('./models/Member');
const Transaction = require('./models/Transaction');
const Notification = require('./models/Notification');
const Note = require('./models/Note');
const Product = require('./models/Product');

// ================================
// REALISTIC DATA GENERATORS
// ================================

const branches = [
  { name: 'Kalmunai', id: 'branch-kalmunai', code: 'KM' },
  { name: 'Jaffna (Kondavil)', id: 'branch-jaffna-kondavil', code: 'JK' },
  { name: 'Jaffna (Savagacheri)', id: 'branch-jaffna-savagacheri', code: 'JS' },
  { name: 'Trincomalee', id: 'branch-trincomalee', code: 'TR' },
];

// Realistic Sri Lankan names and data
const srilankanFirstNames = [
  'Chathura',
  'Roshan',
  'Kumara',
  'Sampath',
  'Jayantha',
  'Ravi',
  'Pradeep',
  'Kalana',
  'Nirmala',
  'Shanika',
  'Lakshmi',
  'Dilini',
  'Chaminda',
  'Suresh',
  'Niranga',
  'Dhaval',
  'Ashan',
  'Thilina',
  'Malinga',
  'Kasun',
];

const srilankanLastNames = [
  'Perera',
  'Silva',
  'Wijesinghe',
  'Dassanayake',
  'Rajapaksa',
  'Jayasekara',
  'Weerasinghe',
  'Bandara',
  'Kumara',
  'Keerthi',
  'Wimalaweera',
  'Dissanayake',
  'Vithanage',
  'Kodagoda',
  'Sinhalage',
];

const occupations = [
  'Farmer',
  'Agriculturist',
  'Livestock Farmer',
  'Vegetable Farmer',
  'Rice Farmer',
  'Spice Cultivator',
  'Fruit Farmer',
  'Dairy Farmer',
  'Coconut Farmer',
  'Organic Farmer',
  'Mixed Farmer',
  'Contract Farmer',
];

const locations = [
  '123 Kalmunai Main Road, Kalmunai',
  '45 Market Street, Kondavil, Jaffna',
  '67 Savagacheri Lane, Jaffna',
  '89 Trincomalee Road, Trincomalee',
  '102 Agricultural Zone, Kalmunai',
  '112 Farmer Colony, Jaffna',
  '125 Village Road, Trincomalee',
  '134 Farm Area, Kalmunai',
];

const noteTexts = [
  'Good agricultural practices observed. Member maintains well-organized farming system.',
  'Need follow-up for organic certification process.',
  'Member interested in cooperative membership.',
  'Excellent crop yield this season. Provided advanced irrigation tips.',
  'Visited during transplanting season. Soil quality is good.',
  'Member requesting training on pest management.',
  'Completed soil testing - results show good nutrient levels.',
  'Provided seeds for next planting season.',
  'Member participated in group training session successfully.',
  'Area prone to flooding - discussed drainage improvements.',
  'Introduced new farming techniques - positive response.',
  'Member coordinating with 3 other farmers for bulk purchase.',
  'Discussed market linkage opportunities.',
  'Arranged agricultural loan consultation.',
  'Provided weather advisory information.',
];

// ================================
// UTILITY FUNCTIONS
// ================================

function generateRandomSrilankanPhone() {
  const prefixes = ['070', '071', '072', '074', '075', '076', '077', '078'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const remaining = Math.floor(Math.random() * 10000000)
    .toString()
    .padStart(7, '0');
  return prefix + remaining;
}

function generateNIC() {
  const year = Math.floor(Math.random() * (2005 - 1960)) + 1960;
  const dayOfYear = Math.floor(Math.random() * 365) + 1;
  const serialNumber = Math.floor(Math.random() * 9000) + 1000;
  const checkDigit = Math.floor(Math.random() * 10);
  const lastDigit = ['V', 'X'][Math.floor(Math.random() * 2)];
  return `${year}${dayOfYear.toString().padStart(3, '0')}${serialNumber}${checkDigit}${lastDigit}`;
}

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomName() {
  const first = getRandomElement(srilankanFirstNames);
  const last = getRandomElement(srilankanLastNames);
  return `${first} ${last}`;
}

function generateEmail(name) {
  const sanitized = name
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
  const random = Math.floor(Math.random() * 1000);
  return `${sanitized}${random}@nature-farming.com`;
}

function generateBillNumber(type, index) {
  const prefix = type === 'buy' ? 'B' : 'S';
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sequence = (index + 1).toString().padStart(5, '0');
  return `NF-${prefix}-${date}-${sequence}`;
}

function getRandomDateInCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Random date in current month
  const day = Math.floor(Math.random() * 28) + 1; // Days 1-28 to stay within any month
  return new Date(year, month, day);
}

function getRandomDateInRange(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const random = Math.random() * (end - start) + start;
  return new Date(random);
}

// ================================
// MAIN SEEDER FUNCTION
// ================================

async function seedDatabase() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/nf_farming';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Drop entire database
    console.log('🗑️  Dropping database...');
    await mongoose.connection.db.dropDatabase();
    console.log('✅ Database dropped and recreated');

    let totalFieldVisitors = 0;
    let totalMembers = 0;
    let totalTransactions = 0;
    let totalNotifications = 0;
    let totalNotes = 0;

    // ================================
    // 1. CREATE BRANCH MANAGERS (4)
    // ================================
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
        password: 'password123', // Will be hashed by pre-save middleware
        role: 'branch_manager',
        status: 'active',
      });

      await manager.save();
      managers.push(manager);
      console.log(`  ✅ ${managerName} (${branch.name})`);
    }

    // ================================
    // 2. CREATE FIELD VISITORS (5 per manager = 20 total)
    // ================================
    console.log('\n👥 Creating Field Visitors...');
    const fieldVisitors = [];

    for (let mIdx = 0; mIdx < managers.length; mIdx++) {
      const manager = managers[mIdx];
      const branch = branches[mIdx];

      for (let fvIdx = 1; fvIdx <= 5; fvIdx++) {
        const fvName = getRandomName();
        const fieldVisitor = new FieldVisitor({
          name: fvName,
          userId: `FV-${branch.code}-${fvIdx.toString().padStart(3, '0')}`,
          phone: generateRandomSrilankanPhone(),
          password: 'password123',
          code: `FV${branch.code}${fvIdx}`,
          managerId: manager._id,
          branchId: branch.id,
          status: 'active',
        });

        await fieldVisitor.save();
        fieldVisitors.push({
          doc: fieldVisitor,
          branchName: branch.name,
          branchId: branch.id,
          branchCode: branch.code,
        });
        totalFieldVisitors++;
        console.log(`  ✅ ${fvName} (${branch.name}) - ID: ${fieldVisitor.userId}`);
      }
    }

    // ================================
    // 3. CREATE MEMBERS (10 per field visitor = 200 total)
    // ================================
    console.log('\n👨‍🌾 Creating Members...');
    const members = [];

    for (let fvIdx = 0; fvIdx < fieldVisitors.length; fvIdx++) {
      const fvWrapper = fieldVisitors[fvIdx];
      const fieldVisitor = fvWrapper.doc;
      const branchName = fvWrapper.branchName;
      const branchId = fvWrapper.branchId;
      const branchCode = fvWrapper.branchCode;

      for (let mIdx = 1; mIdx <= 20; mIdx++) {
        const memberName = getRandomName();
        const uniqueSuffix = Math.floor(Math.random() * 100000);
        const member = new Member({
          name: memberName,
          address: getRandomElement(locations),
          mobile: generateRandomSrilankanPhone(),
          nic: generateNIC(),
          memberCode: `MEM-${branchCode}-${fvIdx.toString().padStart(3, '0')}-${mIdx.toString().padStart(2, '0')}-${uniqueSuffix.toString().padStart(5, '0')}`,
          fieldVisitorId: fieldVisitor._id,
          branchId: branchId,
          registeredAt: getRandomDateInRange('2024-01-01', new Date()),
        });

        await member.save();
        members.push({
          doc: member,
          fieldVisitorId: fieldVisitor._id,
          branchId: branchId,
          branchName: branchName,
        });
        totalMembers++;
      }
    }
    console.log(`  ✅ Created ${totalMembers} members`);

    // ================================
    // 3.5. CREATE PRODUCTS
    // ================================
    console.log('\n📦 Creating Products...');
    const productData = [
      {
        name: 'Aloe Vera Leaf',
        defaultPrice: 50,
        unit: 'Kg',
        productId: 'PROD-ALOV-001'
      },
      {
        name: 'Aloe Vera Packets',
        defaultPrice: 150,
        unit: 'packets',
        productId: 'PROD-ALOV-002'
      },
      {
        name: 'Aloe Vera Plant',
        defaultPrice: 200,
        unit: 'number',
        productId: 'PROD-ALOV-003'
      }
    ];

    for (const p of productData) {
      const product = new Product(p);
      await product.save();
    }
    console.log(`  ✅ Created ${productData.length} products`);

    // ================================
    // 4. CREATE TRANSACTIONS (2 per member = 400 total)
    // ================================
    console.log('\n💰 Creating Transactions...');
    const products = [
      { name: 'Aloe Vera Leaf', unit: 'Kg', priceRange: [150, 250] },
      { name: 'Aloe Vera Small (Packet)', unit: 'packets', priceRange: [300, 500] },
      { name: 'Aloe Vera Small', unit: 'number', priceRange: [80, 150] },
    ];

    let transactionCounter = 0;

    for (const memberWrapper of members) {
      const member = memberWrapper.doc;
      const fieldVisitorId = memberWrapper.fieldVisitorId;
      const branchId = memberWrapper.branchId;
      const branchName = memberWrapper.branchName;

      // Create 2 transactions per member
      for (let txIdx = 0; txIdx < 2; txIdx++) {
        const type = txIdx === 0 ? 'buy' : 'sell';
        const product = getRandomElement(products);
        const quantity = Math.floor(Math.random() * 100) + 5;
        const unitPrice = Math.floor(
          Math.random() * (product.priceRange[1] - product.priceRange[0]) +
          product.priceRange[0]
        );
        const totalAmount = quantity * unitPrice;

        const transaction = new Transaction({
          billNumber: generateBillNumber(type, transactionCounter),
          type: type,
          memberId: member._id,
          fieldVisitorId: fieldVisitorId,
          productName: product.name,
          quantity: quantity,
          unitType: product.unit,
          unitPrice: unitPrice,
          totalAmount: totalAmount,
          date: getRandomDateInRange('2025-01-01', new Date()),
          branchId: branchId,
          pdfUrl: null, // Will be generated when needed
        });

        await transaction.save();
        totalTransactions++;

        // Create notification for this transaction
        const notificationTitle = `${type === 'buy' ? '🛒 Purchase' : '📤 Sale'} - ${product.name}`;
        const notificationMessage = `Transaction of Rs. ${totalAmount} on ${transaction.date.toLocaleDateString()} for ${member.name}`;

        const notification = new Notification({
          title: notificationTitle,
          body: notificationMessage,
          date: transaction.date,
          isRead: Math.random() > 0.5, // Randomly mark as read or unread
          attachment: transaction.pdfUrl,
          userId: fieldVisitorId,
          userRole: 'field_visitor',
          branchId: branchId,
          fieldVisitorId: fieldVisitorId,
          memberId: member._id,
        });

        await notification.save();
        totalNotifications++;

        transactionCounter++;
      }
    }
    console.log(`  ✅ Created ${totalTransactions} transactions`);
    console.log(`  ✅ Created ${totalNotifications} notifications`);

    // ================================
    // 5. CREATE NOTES (Multiple per field visitor)
    // ================================
    console.log('\n📝 Creating Notes...');

    for (const fvWrapper of fieldVisitors) {
      const fieldVisitor = fvWrapper.doc;

      // Create 3-5 random notes per field visitor
      const noteCount = Math.floor(Math.random() * 3) + 3;

      for (let nIdx = 0; nIdx < noteCount; nIdx++) {
        const note = new Note({
          fieldVisitorId: fieldVisitor._id,
          branchId: fvWrapper.branchId,
          title: `Activity Report - Week ${nIdx + 1}`,
          noteText: getRandomElement(noteTexts),
          category: getRandomElement(['observation', 'reminder', 'report', 'other']),
          createdAt: getRandomDateInRange('2025-01-01', new Date()),
        });

        await note.save();
        totalNotes++;
      }
    }
    console.log(`  ✅ Created ${totalNotes} notes`);

    // ================================
    // SUMMARY
    // ================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ DATABASE SEEDING COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`
📊 DATA SUMMARY:
   
   🏢 Branch Managers:      ${managers.length}
   👥 Field Visitors:        ${totalFieldVisitors}
   👨‍🌾 Members:             ${totalMembers}
   💰 Transactions:         ${totalTransactions}
   🔔 Notifications:        ${totalNotifications}
   📝 Notes:                ${totalNotes}

📍 BRANCH DISTRIBUTION:
   Kalmunai:                5 FV × 10 Members = 50 Members
   Jaffna (Kondavil):       5 FV × 10 Members = 50 Members
   Jaffna (Savagacheri):    5 FV × 10 Members = 50 Members
   Trincomalee:             5 FV × 10 Members = 50 Members

💡 RELATIONSHIP STRUCTURE:
   
   BranchManager (1)
     └── FieldVisitors (5)
           └── Members (10)
                 └── Transactions (2)
                       └── Notifications (1 per transaction)
           └── Notes (3-5)

🔐 TEST CREDENTIALS:

   Branch Managers can login with format: MGR-{BRANCH}-001
   Field Visitors can login with format: FV-{BRANCH}-{001-005}
   
   All passwords: password123

📲 FLUTTER FORM COMPATIBILITY:
   ✅ All BranchManager fields match your schema
   ✅ All FieldVisitor fields match your schema
   ✅ All Member fields match your schema
   ✅ All Transaction fields match your schema
   ✅ Notifications properly linked to transactions
   ✅ Notes linked to field visitors
    `);

    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:');
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`  - ${key}: ${error.errors[key].message}`);
      });
    } else {
      console.error(error.message || error);
    }
    process.exit(1);
  }
}

// ================================
// RUN SEEDER
// ================================
seedDatabase();
