require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

async function addProducts() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('✅ Connected');

        const products = [
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

        console.log('📦 Adding products...');

        for (const p of products) {
            await Product.findOneAndUpdate(
                { productId: p.productId },
                p,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            console.log(`  ✅ Processed: ${p.name} (${p.unit})`);
        }

        console.log('🎉 Done!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

addProducts();
