require('dotenv').config();
const mongoose = require('mongoose');

const Product = require('./models/Product');
const Transaction = require('./models/Transaction');
const Notification = require('./models/Notification');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  // Allowed products = the ones currently in products collection
  const products = await Product.find({}, { name: 1 });
  const allowedNames = new Set(products.map((p) => p.name));
  console.log('Allowed products:', [...allowedNames]);

  // Find unwanted transactions (productName not in allowed list)
  const unwanted = await Transaction.find({ productName: { $nin: [...allowedNames] } }, { _id: 1, productName: 1, billNumber: 1 });
  const unwantedIds = unwanted.map((t) => t._id);
  console.log(`Unwanted transactions found: ${unwantedIds.length}`);

  if (unwantedIds.length) {
    const delTxn = await Transaction.deleteMany({ _id: { $in: unwantedIds } });
    const delNot = await Notification.deleteMany({ transactionId: { $in: unwantedIds } });

    console.log('Deleted transactions:', delTxn.deletedCount);
    console.log('Deleted notifications:', delNot.deletedCount);
  } else {
    console.log('No unwanted transactions to delete.');
  }

  // Show remaining counts
  const [txnCount, notifCount] = await Promise.all([
    Transaction.countDocuments(),
    Notification.countDocuments(),
  ]);

  console.log('Remaining counts -> Transactions:', txnCount, ', Notifications:', notifCount);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Cleanup failed:', err);
  mongoose.disconnect();
});
