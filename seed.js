require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Manager = require('./models/Manager');
const FieldVisitor = require('./models/FieldVisitor');
const Product = require('./models/Product');

connectDB();

const seedData = async () => {
    try {
        await Manager.deleteMany();
        await FieldVisitor.deleteMany();
        await Product.deleteMany();

        await Manager.create({
            name: 'Admin Manager',
            email: 'admin@nf.com',
            password: 'password123',
            code: 'MGR001'
        });

        await FieldVisitor.create({
            name: 'John Field',
            userId: 'FV001',
            phone: '0771234567',
            password: 'password123'
        });

        await Product.create([
            { name: 'Aloe Vera Leaf', defaultPrice: 150, unit: 'Kg', productId: 'prod-001' },
            { name: 'Aloe Vera Small (Packet)', defaultPrice: 350, unit: 'number', productId: 'prod-002' },
            { name: 'Aloe Vera Small', defaultPrice: 100, unit: 'number', productId: 'prod-003' }
        ]);

        console.log('Data Imported!');
        process.exit();
    } catch (error) {
        console.error(`${error}`);
        process.exit(1);
    }
};

seedData();
