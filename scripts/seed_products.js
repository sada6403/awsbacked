const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/Product');

const products = [
    {
        productId: 'prod-aloe-packet',
        name: 'Aloe Vera Packets',
        defaultBuyPrice: 100,
        defaultSellPrice: 100,
        unit: 'packets',
        imageUrl: 'assets/images/alovera.webp'
    },
    {
        productId: 'prod-aloe-plant',
        name: 'Aloe Vera Plant',
        defaultBuyPrice: 250,
        defaultSellPrice: 250,
        unit: 'number',
        imageUrl: 'assets/images/alovera.webp'
    },
    {
        productId: 'prod-aloe-leaf',
        name: 'Aloe Vera Leaf',
        defaultBuyPrice: 150,
        defaultSellPrice: 150,
        unit: 'Kg',
        imageUrl: 'assets/images/alovera.webp'
    }
];

async function seedProducts() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected successfully.');

        for (const prod of products) {
            const result = await Product.findOneAndUpdate(
                { productId: prod.productId },
                prod,
                { upsert: true, new: true }
            );
            console.log(`[OK] Product seeded: ${result.name} (${result.productId})`);
        }

        console.log('Seeding complete.');
        process.exit(0);
    } catch (err) {
        console.error('Seeding failed:', err);
        process.exit(1);
    }
}

seedProducts();
