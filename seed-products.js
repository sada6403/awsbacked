require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/farming-db';

async function seedProducts() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB\n');

        // Clear existing products
        await Product.deleteMany({});
        console.log('Cleared existing products\n');

        // Products to add
        const products = [
            {
                name: 'alovera leaves',
                defaultPrice: 150,
                unit: 'Kg',
                productId: 'PROD-ALOV-001'
            },
            {
                name: 'alovera small packet',
                defaultPrice: 50,
                unit: 'number',
                productId: 'PROD-ALOV-002'
            },
            {
                name: 'alovera small',
                defaultPrice: 100,
                unit: 'Kg',
                productId: 'PROD-ALOV-003'
            }
        ];

        // Insert products
        const inserted = await Product.insertMany(products);
        
        console.log('✅ Products Added Successfully:\n');
        inserted.forEach((product, index) => {
            console.log(`${index + 1}. ${product.name}`);
            console.log(`   ID: ${product.productId}`);
            console.log(`   Price: Rs. ${product.defaultPrice}`);
            console.log(`   Unit: ${product.unit}\n`);
        });

        console.log(`Total: ${inserted.length} products added`);

        // Verify
        const allProducts = await Product.find();
        console.log(`\nDatabase now contains ${allProducts.length} products`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\nDatabase connection closed');
    }
}

seedProducts();
