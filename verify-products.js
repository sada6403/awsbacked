require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/farming-db';

async function verifyDatabase() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB\n');

        // Check all products
        const allProducts = await Product.find();
        
        console.log('📊 Current Products in Database:\n');
        
        if (allProducts.length === 0) {
            console.log('❌ No products found (database is empty)');
        } else {
            allProducts.forEach((product, index) => {
                console.log(`${index + 1}. ${product.name}`);
                console.log(`   ID: ${product.productId}`);
                console.log(`   Price: Rs. ${product.defaultPrice}`);
                console.log(`   Unit: ${product.unit}\n`);
            });
        }

        console.log(`Total: ${allProducts.length} products\n`);

        // Check if only alovera products exist
        const aloveryProducts = allProducts.filter(p => p.productId?.includes('ALOV'));
        console.log(`✅ Alovera Products: ${aloveryProducts.length}`);
        
        const otherProducts = allProducts.filter(p => !p.productId?.includes('ALOV'));
        if (otherProducts.length > 0) {
            console.log(`⚠️  Other Products (will be deleted):`);
            otherProducts.forEach(p => console.log(`   - ${p.name}`));
        } else {
            console.log('✅ No other products (clean database)');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
    }
}

verifyDatabase();
