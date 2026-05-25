require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AdminUser = require('./models/AdminUser');

const ATLAS_MONGODB_URI = process.env.MONGODB_URI; 
const LOCAL_MONGODB_URI = process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf_farming';
const DB_PREFERENCE = (process.env.DB_PREFERENCE || 'atlas').toLowerCase();

const connectDB = async () => {
    if (DB_PREFERENCE === 'atlas-only') {
        await mongoose.connect(ATLAS_MONGODB_URI);
        return;
    }
    const order = DB_PREFERENCE === 'local'
        ? [{ label: 'local', uri: LOCAL_MONGODB_URI }, { label: 'atlas', uri: ATLAS_MONGODB_URI }]
        : [{ label: 'atlas', uri: ATLAS_MONGODB_URI }, { label: 'local', uri: LOCAL_MONGODB_URI }];

    for (const target of order) {
        if (!target.uri) continue;
        try {
            await mongoose.connect(target.uri);
            console.log(`Connected to ${target.label}`);
            return;
        } catch (e) {}
    }
    throw new Error('No DB connection');
};

const seedSuperAdmin = async () => {
  try {
    await connectDB();
    
    const email = 'superadmin@nf.com';
    const existingAdmin = await AdminUser.findOne({ email });

    if (existingAdmin) {
      console.log('Super Admin already exists.');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Admin@123', salt);

    const newAdmin = new AdminUser({
      name: 'Super Admin',
      email,
      phone: '+94700000000',
      passwordHash,
      role: 'SuperAdmin',
      status: 'active'
    });

    await newAdmin.save();
    console.log('Super Admin created successfully!');
    console.log('Email: superadmin@nf.com');
    console.log('Password: Admin@123');
    process.exit(0);

  } catch (error) {
    console.error('Error seeding Super Admin:', error);
    process.exit(1);
  }
};

seedSuperAdmin();
