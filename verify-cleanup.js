require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Transaction = require('./models/Transaction');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming';

async function run() {
  await mongoose.connect(MONGO_URI);
  const products = await Product.find({}, { name: 1, _id: 0 });
  const names = products.map((p) => p.name);
  const totalTx = await Transaction.countDocuments();
  const unwanted = await Transaction.countDocuments({ productName: { $nin: names } });
  console.log('Allowed product names:', names);
  console.log('Total transactions:', totalTx);
  console.log('Unwanted transactions remaining:', unwanted);
  const sampleBad = await Transaction.find({ productName: { $nin: names } }, { billNumber: 1, productName: 1 }).limit(3);
  console.log('Sample unwanted (if any):', sampleBad);
  await mongoose.disconnect();
}

run().catch((e) => { console.error(e); mongoose.disconnect(); });
