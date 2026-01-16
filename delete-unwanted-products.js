require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/nf_farming';

async function run() {
  await mongoose.connect(MONGO_URI);
  const res = await Product.deleteMany({ productId: { $in: ['PROD-FERT-004', 'PROD-IRR-005'] } });
  console.log('Deleted count:', res.deletedCount);
  const remaining = await Product.find({}, { productId: 1, _id: 0 });
  console.log('Remaining productIds:', remaining.map((p) => p.productId));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  mongoose.disconnect();
});
