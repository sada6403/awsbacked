require('dotenv').config();
const mongoose = require('mongoose');

const BranchManager = require('./models/BranchManager');
const FieldVisitor = require('./models/FieldVisitor');
const Member = require('./models/Member');
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');
const Notification = require('./models/Notification');
const Note = require('./models/Note');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming';

function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateBillNumber(prefix, index) {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `NF-${prefix}-${date}-${(index + 1).toString().padStart(4, '0')}`;
}

async function seedProductsIfEmpty() {
  const count = await Product.countDocuments();
  if (count > 0) {
    return { created: 0, skipped: true };
  }

  const products = [
    { name: 'Aloe Vera Leaf', defaultPrice: 150, unit: 'Kg', productId: 'PROD-ALOV-001' },
    { name: 'Aloe Vera Small Packet', defaultPrice: 50, unit: 'number', productId: 'PROD-ALOV-002' },
    { name: 'Aloe Vera Small', defaultPrice: 100, unit: 'Kg', productId: 'PROD-ALOV-003' },
    { name: 'Organic Fertilizer', defaultPrice: 1800, unit: 'Kg', productId: 'PROD-FERT-004' },
    { name: 'Drip Kit', defaultPrice: 3200, unit: 'number', productId: 'PROD-IRR-005' },
  ];

  const inserted = await Product.insertMany(products);
  return { created: inserted.length, skipped: false };
}

async function seedTransactionsAndNotificationsIfEmpty() {
  const txnCount = await Transaction.countDocuments();
  if (txnCount > 0) {
    return { transactionsCreated: 0, notificationsCreated: 0, skipped: true };
  }

  const products = await Product.find();
  if (!products.length) {
    throw new Error('Seed products before creating transactions');
  }

  const members = await Member.find().limit(30); // keep run fast but fill data
  if (!members.length) {
    throw new Error('No members found; cannot seed transactions');
  }

  const fieldVisitors = await FieldVisitor.find();
  if (!fieldVisitors.length) {
    throw new Error('No field visitors found; cannot seed transactions');
  }

  const transactions = [];
  members.forEach((member, idx) => {
    const fvId = member.fieldVisitorId;
    const branchId = member.branchId || 'default-branch';

    for (let i = 0; i < 2; i += 1) {
      const product = pickRandom(products);
      const quantity = randomInt(5, 25);
      const unitPrice = product.defaultPrice + randomInt(-10, 25);
      const totalAmount = quantity * unitPrice;
      const type = i === 0 ? 'buy' : 'sell';

      transactions.push({
        billNumber: generateBillNumber(type === 'buy' ? 'B' : 'S', idx * 2 + i),
        type,
        memberId: member._id,
        fieldVisitorId: fvId,
        productName: product.name,
        quantity,
        unitType: product.unit,
        unitPrice,
        totalAmount,
        date: new Date(),
        branchId,
        pdfUrl: '',
      });
    }
  });

  const insertedTxns = await Transaction.insertMany(transactions);

  const notifications = insertedTxns.map((txn) => ({
    title: `${txn.type === 'buy' ? 'Purchase' : 'Sale'} recorded (${txn.billNumber})`,
    body: `${txn.productName} - ${txn.quantity} ${txn.unitType} at Rs. ${txn.unitPrice} (${txn.type})`,
    date: txn.date,
    isRead: false,
    transactionId: txn._id,
    fieldVisitorId: txn.fieldVisitorId,
    memberId: txn.memberId,
    branchId: txn.branchId,
    userId: txn.fieldVisitorId,
    userRole: 'field_visitor',
  }));

  const insertedNotifications = await Notification.insertMany(notifications);

  return {
    transactionsCreated: insertedTxns.length,
    notificationsCreated: insertedNotifications.length,
    skipped: false,
  };
}

async function seedNotesIfEmpty() {
  const noteCount = await Note.countDocuments();
  if (noteCount > 0) {
    return { created: 0, skipped: true };
  }

  const fieldVisitors = await FieldVisitor.find();
  if (!fieldVisitors.length) {
    throw new Error('No field visitors found; cannot seed notes');
  }

  const samples = [
    'Visited member cluster; crops healthy and pest-free.',
    'Need follow-up training on irrigation scheduling.',
    'Soil moisture low; recommended mulching.',
    'Coordinating group buy for fertilizers next week.',
    'Shared weather advisory and flood precautions.',
  ];

  const categories = ['observation', 'reminder', 'report', 'other'];

  const notes = [];
  fieldVisitors.forEach((fv) => {
    for (let i = 0; i < 2; i += 1) {
      notes.push({
        fieldVisitorId: fv._id,
        title: `Visit note ${i + 1}`,
        noteText: pickRandom(samples),
        category: categories[(i + notes.length) % categories.length],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  const inserted = await Note.insertMany(notes);
  return { created: inserted.length, skipped: false };
}

async function reportStatus() {
  const [mgr, fv, mem, prod, txn, notif, note] = await Promise.all([
    BranchManager.countDocuments(),
    FieldVisitor.countDocuments(),
    Member.countDocuments(),
    Product.countDocuments(),
    Transaction.countDocuments(),
    Notification.countDocuments(),
    Note.countDocuments(),
  ]);

  console.log('\nCurrent counts:');
  console.log(`  Branch Managers:   ${mgr}`);
  console.log(`  Field Visitors:    ${fv}`);
  console.log(`  Members:           ${mem}`);
  console.log(`  Products:          ${prod}`);
  console.log(`  Transactions:      ${txn}`);
  console.log(`  Notifications:     ${notif}`);
  console.log(`  Notes:             ${note}`);
}

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  await reportStatus();

  const productResult = await seedProductsIfEmpty();
  if (productResult.skipped) {
    console.log('Products already present; skipped seeding.');
  } else {
    console.log(`Seeded ${productResult.created} products.`);
  }

  const notesResult = await seedNotesIfEmpty();
  if (notesResult.skipped) {
    console.log('Notes already present; skipped seeding.');
  } else {
    console.log(`Seeded ${notesResult.created} notes.`);
  }

  const txnResult = await seedTransactionsAndNotificationsIfEmpty();
  if (txnResult.skipped) {
    console.log('Transactions/notifications already present; skipped seeding.');
  } else {
    console.log(`Seeded ${txnResult.transactionsCreated} transactions and ${txnResult.notificationsCreated} notifications.`);
  }

  await reportStatus();

  await mongoose.disconnect();
  console.log('\nDatabase connection closed.');
}

main().catch((err) => {
  console.error('Seeding failed:', err.message);
  mongoose.disconnect();
});
