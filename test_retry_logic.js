const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const Member = require('./models/Member');
const BranchManager = require('./models/BranchManager');
const FieldVisitor = require('./models/FieldVisitor');
const Product = require('./models/Product');

const ATLAS_MONGODB_URI = process.env.MONGODB_URI;
const LOCAL_MONGODB_URI = process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf-farming';

const connectDB = async () => {
    try {
        await mongoose.connect(ATLAS_MONGODB_URI || LOCAL_MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('DB Connection Failed:', err);
        process.exit(1);
    }
};

async function run() {
    await connectDB();

    try {
        const admin = new mongoose.mongo.Admin(mongoose.connection.db);
        const list = await admin.listDatabases();
        console.log('Available Databases:', list.databases.map(d => d.name).join(', '));
    } catch (e) {
        console.log('Could not list databases:', e.message);
    }

    console.log('--- Starting Test Transaction ---');

    try {
        // 1. Get Manager or FV for Token
        let user = await BranchManager.findOne();
        let role = 'manager';

        if (!user) {
            console.log('⚠️ No BranchManager found. Trying FieldVisitor...');
            user = await FieldVisitor.findOne();
            role = 'field_visitor';
        }

        if (!user) {
            console.error('❌ No User (Manager/FV) found. Cannot generate token.');
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log('Collections:', collections.map(c => c.name));
            process.exit(1);
        }
        console.log(`✅ Found User: ${user.name} (${role})`);

        const token = jwt.sign({ id: user._id, role: role, branchId: user.branchId }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // 2. Get Target Member
        const mobileRec = '0703027685';
        let member = await Member.findOne({ mobile: mobileRec });

        if (!member) {
            console.log(`⚠️ Direct match for ${mobileRec} failed. Trying regex or Name...`);
            member = await Member.findOne({ mobile: { $regex: '0703027685' } });
        }
        if (!member) {
            member = await Member.findOne({ name: { $regex: 'sabiharan', $options: 'i' } });
        }

        if (!member) {
            console.error(`❌ Member with mobile ${mobileRec} or name 'sabiharan' not found.`);
            // List first 5 members to see format
            const all = await Member.find().limit(5);
            console.log('Sample Members:', all.map(m => `${m.name}: ${m.mobile}`));
            process.exit(1);
        }
        console.log('✅ Found Member:', member.name, `(${member.branchId})`);

        // 3. Get Field Visitor (must match branch)
        // If member has fv, use that.
        let fv = null;
        if (member.fieldVisitorId) {
            fv = await FieldVisitor.findById(member.fieldVisitorId);
        }
        if (!fv) {
            fv = await FieldVisitor.findOne({ branchId: member.branchId });
        }

        if (!fv) {
            console.error(`❌ No Field Visitor found for branch ${member.branchId}.`);
            process.exit(1);
        }
        console.log('✅ Found Field Visitor:', fv.name);

        // 4. Get Product
        const product = await Product.findOne();
        const productId = product ? product.productId : 'PROD-TEST';
        const productName = product ? product.name : 'Test Product';
        console.log('✅ using Product:', productName);

        // 5. Payload
        const payload = {
            transactionType: 'BUY',
            memberId: member._id,
            fieldVisitorId: fv._id || fv.userId, // Controller handles ID validation
            productId: productId,
            quantity: 5,
            unitType: 'Kg',
            unitPrice: 50
        };

        console.log('📤 Sending Request to http://localhost:3000/api/transactions ...');

        const response = await fetch('http://localhost:3000/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('--- Response ---');
        console.log('Status:', response.status);
        if (response.status === 201) {
            console.log('✅ Transaction Created Successfully!');
            console.log('Bill Number:', data.data.billNumber);
            console.log('PDF URL:', data.data.pdfUrl);
        } else {
            console.error('❌ Transaction Failed:', data.message);
            if (data.debug) console.error('Debug:', data.debug);
        }

    } catch (error) {
        console.error('❌ Unexpected Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
