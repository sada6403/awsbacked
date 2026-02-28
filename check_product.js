const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkProductAndManager = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.log('MONGODB_URI not found in .env');
            return;
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Product = require('./models/Product');
        const BranchManager = require('./models/BranchManager');
        const ManagersMember = require('./models/ManagersMember');

        const products = await Product.find({ name: /Aloe Vera/i }).lean();
        console.log('--- Products ---');
        products.forEach(p => console.log(`Name: ${p.name}, ID: ${p.productId}, Price: ${p.price}`));

        const managers = await BranchManager.find({}).lean();
        console.log('--- Managers ---');
        managers.forEach(m => console.log(`Name: ${m.fullName}, Balance: ${m.walletBalance}, Branch: ${m.branchId}`));

        const sabi = await ManagersMember.findOne({ mobile: '0743469972' }).lean();
        console.log('--- Sabi ---');
        if (sabi) console.log(`ID: ${sabi._id}, Name: ${sabi.fullName || sabi.name}, Branch: ${sabi.branchId}`);

        await mongoose.connection.close();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkProductAndManager();
