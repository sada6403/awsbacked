const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Transaction = require('./models/Transaction');
const Member = require('./models/Member');
const FieldVisitor = require('./models/FieldVisitor');
const Product = require('./models/Product');

dotenv.config();

const createCurrentMonthData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Get limits for the current month
        const now = new Date(); // 2026-01-01...
        console.log(`Current System Date: ${now.toISOString()}`);

        // We want dates in this month
        const year = now.getFullYear();
        const month = now.getMonth();

        // Fetch valid IDs
        const members = await Member.find({});
        const visitors = await FieldVisitor.find({});
        const products = await Product.find({});

        if (members.length === 0 || visitors.length === 0) {
            console.log('No members or visitors found. Please run seed-comprehensive.js first.');
            process.exit(1);
        }

        console.log(`Found ${members.length} members and ${visitors.length} visitors.`);

        const transactions = [];
        const types = ['buy', 'sell'];

        // Create 20 random transactions for THIS month
        for (let i = 0; i < 20; i++) {
            const member = members[Math.floor(Math.random() * members.length)];
            const visitor = visitors.find(v => v.branchId === member.branchId) || visitors[0];
            const product = products.length ? products[Math.floor(Math.random() * products.length)] : { name: 'Corn', unitType: 'kg', price: 100 };
            const type = types[Math.floor(Math.random() * types.length)];

            // Random day in current month (up to current day + a few more if early in month, but let's stick to 1st-28th to be safe)
            // Actually user is on Jan 1st 2026. So we must put them on Jan 1st or very recent.
            // Let's spread them over Jan 1st for now to ensure they are visible.
            // Or if today is Jan 1st, just use today.
            const day = Math.floor(Math.random() * 28) + 1;
            // If we are strictly "future" relative to "now", they might not show if query is <= now. 
            // The dashboard query is <= endOfMonth, so future dates in this month are fine.

            const date = new Date(year, month, day, 10 + Math.floor(Math.random() * 8), 0, 0);

            const qty = Math.floor(Math.random() * 50) + 1;
            const price = product.price || 50;
            const total = qty * price;

            transactions.push({
                billNumber: `NF-B-${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}-${String(i + 1).padStart(5, '0')}`,
                type,
                memberId: member._id,
                fieldVisitorId: visitor._id,
                productName: product.name,
                quantity: qty,
                unitType: product.unitType || 'kg',
                unitPrice: price,
                totalAmount: total,
                date: date,
                branchId: visitor.branchId || 'default-branch'
            });
        }

        await Transaction.insertMany(transactions);
        console.log(`Successfully added ${transactions.length} transactions for ${year}-${month + 1}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

createCurrentMonthData();
