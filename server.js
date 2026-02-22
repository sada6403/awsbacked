// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { initializeFCM } = require('./utils/pushNotification');

// Initialize Firebase Admin
initializeFCM();

// Import routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const extraMemberRoutes = require('./routes/extraMemberRoutes');
const memberRoutes = require('./routes/memberRoutes');
const fieldVisitorRoutes = require('./routes/fieldVisitorRoutes');
const productRoutes = require('./routes/productRoutes');
const reportRoutes = require('./routes/reportRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const noteRoutes = require('./routes/noteRoutes');
const walletRoutes = require('./routes/walletRoutes');
const managersMemberRoutes = require('./routes/managersMemberRoutes');
const draftRoutes = require('./routes/draftRoutes');
const chatRoutes = require('./routes/chatRoutes');

// Import error middleware
const errorHandler = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware
// Enhanced CORS configuration for Flutter app
app.use(cors({
    origin: '*', // Allow all origins (adjust in production)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Increased limit for signature images
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static files (PDF bills)
const path = require('path');
app.use('/bills', express.static(path.join(__dirname, 'public', 'bills')));
app.use('/members', express.static(path.join(__dirname, 'public', 'members')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// 2. Connect to MongoDB Atlas with automatic fallback to local MongoDB
// Why fallback exists:
// - Atlas may be temporarily unreachable (network issues, IP not whitelisted)
// - Allows development to continue with local MongoDB
// - Production should always use Atlas (whitelist server IP in Atlas dashboard)
//
// To whitelist your IP for Atlas:
// 1. Go to MongoDB Atlas → Network Access
// 2. Click "Add IP Address"
// 3. Add your current IP or use 0.0.0.0/0 for testing (not recommended for production)

const ATLAS_MONGODB_URI = process.env.MONGODB_URI; // MongoDB Atlas connection string
const LOCAL_MONGODB_URI = process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/nf_farming';
const DB_PREFERENCE = (process.env.DB_PREFERENCE || 'atlas').toLowerCase();

const connectDB = async () => {
    // Atlas-only mode: no local fallback allowed
    if (DB_PREFERENCE === 'atlas-only') {
        if (!ATLAS_MONGODB_URI) {
            console.error('MONGODB_URI is not set; cannot connect to Atlas.');
            process.exit(1);
        }
        try {
            await mongoose.connect(ATLAS_MONGODB_URI);
            console.log('MongoDB Connected to Atlas!');
            return;
        } catch (error) {
            console.error(`Atlas connection failed: ${error.message}`);
            process.exit(1);
        }
    }

    // Atlas-first or local-first with optional fallback
    const order = DB_PREFERENCE === 'local'
        ? [
            { label: 'local MongoDB', uri: LOCAL_MONGODB_URI },
            { label: 'MongoDB Atlas', uri: ATLAS_MONGODB_URI },
        ]
        : [
            { label: 'MongoDB Atlas', uri: ATLAS_MONGODB_URI },
            { label: 'local MongoDB', uri: LOCAL_MONGODB_URI },
        ];

    for (const target of order) {
        if (!target.uri) continue;
        try {
            await mongoose.connect(target.uri);
            console.log(`MongoDB Connected to ${target.label}!`);
            return;
        } catch (error) {
            console.error(`${target.label} connection failed: ${error.message}`);
        }
    }

    console.error('MongoDB connection failed, stopping server');
    process.exit(1);
};

// 3. Models are imported from separate files to avoid conflicts
// All models defined in ./models/ directory

// Import models
const Member = require('./models/Member');

// 4. Routes

// Register API routes


app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/extra-members', extraMemberRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/fieldvisitors', fieldVisitorRoutes);
app.use('/api/products', productRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/managers-members', managersMemberRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/chat', chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
});

// Fallback: GET /api/members (for backward compatibility)
// Note: This might conflict with memberRoutes, so comment out if needed
// app.get('/api/members', async (req, res) => {
//     try {
//         const members = await Member.find().sort({ createdAt: -1 });
//         res.status(200).json({
//             success: true,
//             count: members.length,
//             data: members
//         });
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ success: false, message: 'Server Error' });
//     }
// });

// POST /api/members - Register a new member
// Moved to memberRoutes.js - using proper router
/*
app.post('/api/members', async (req, res) => {
    try {
        console.log('Received payload:', req.body);

        // Destructure common fields. 
        // Note: The app sends specific top-level fields AND a 'registrationData' map.
        const {
            id, fullName, mobile, address, nic, role, registrationData
        } = req.body;

        // Validation
        if (!fullName || !mobile) {
            return res.status(400).json({
                success: false,
                message: 'Please provide full name and mobile number'
            });
        }

        // Extract residents and land from registrationData if available
        let residents = [];
        if (registrationData && registrationData.residents && Array.isArray(registrationData.residents)) {
            residents = registrationData.residents;
        }

        let landOne = {};
        if (registrationData) {
            landOne = {
                type: registrationData.land1_type,
                sizeAcres: registrationData.land1_size,
                district: registrationData.land1_district,
                dsDivision: registrationData.land1_dsDivision,
                gnDivision: registrationData.land1_gnDivision,
                kanna: registrationData.land1_kanna
            };
        }

        // Create new member instance
        const newMember = new Member({
            id: id || Date.now().toString(),
            fullName,
            mobile,
            nic,
            email: registrationData ? registrationData.email : undefined,
            location: address,
            role: role || 'Member',
            registrationData, // Save the full raw dump just in case
            residents,
            landOne
        });

        // Await the save operation properly
        const savedMember = await newMember.save();

        console.log('Member saved:', savedMember.id);

        // Return the saved document immediately
        res.status(201).json({
            success: true,
            message: 'Member registered successfully',
            data: savedMember
        });

    } catch (error) {
        console.error('Registration Error:', error);
        
        // Duplicate key error (e.g. ID or NIC collision)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Member with this ID or data already exists'
            });
        }
        
        // Mongoose validation error
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }
        
        // General server error
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
});
*/

// Debug endpoint to list all users (for testing)
app.get('/api/users', async (req, res) => {
    try {
        const BranchManager = require('./models/BranchManager');
        const FieldVisitor = require('./models/FieldVisitor');

        const managers = await BranchManager.find().select('-password');
        const fieldVisitors = await FieldVisitor.find().select('-password');
        const members = await Member.find();

        res.status(200).json({
            success: true,
            data: {
                managers: managers.map(m => ({
                    _id: m._id,
                    name: m.fullName,
                    email: m.email,
                    code: m.userId,
                    role: 'manager'
                })),
                fieldVisitors: fieldVisitors.map(fv => ({
                    _id: fv._id,
                    name: fv.name,
                    userId: fv.userId,
                    phone: fv.phone,
                    role: 'field_visitor',
                    status: fv.status
                })),
                members: members.map(m => ({
                    _id: m._id,
                    id: m.id,
                    fullName: m.fullName,
                    mobile: m.mobile,
                    role: m.role,
                    status: m.status
                })),
                counts: {
                    managers: managers.length,
                    fieldVisitors: fieldVisitors.length,
                    members: members.length
                }
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users',
            error: error.message
        });
    }
});

// Global Error Handler
app.use(errorHandler);

// Root Route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// 5. Start Server after DB is ready
(async () => {
    await connectDB();
    const server = app.listen(PORT, '0.0.0.0', () => {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let localIp = '127.0.0.1';

        // Find the first external IPv4 address
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                    break;
                }
            }
            if (localIp !== '127.0.0.1') break;
        }

        console.log(`Server started on port ${PORT}`);
        console.log(`Server is running at:`);
        console.log(`- Local:   http://localhost:${PORT}`);
        console.log(`- Network: http://${localIp}:${PORT}`);
        console.log(`Access the API at http://${localIp}:${PORT}/api`);
    });
})().catch((err) => {
    console.error(`Startup failure: ${err.message}`);
    process.exit(1);
});
