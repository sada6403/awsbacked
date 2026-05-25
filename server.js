// server.js
require('dotenv').config();

// Force the entire Node.js backend to run in Sri Lankan Time (+05:30)
process.env.TZ = 'Asia/Colombo';

process.on('uncaughtException', (err) => {
    console.error('CRITICAL UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
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
const branchRoutes = require('./routes/branchRoutes');
const adminRoutes = require('./routes/admin/index');

// Import error middleware
const errorHandler = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;
const DEBUG_REQUESTS = process.env.DEBUG_REQUESTS === 'true';

// 1. Middleware
app.use(compression());

app.use((req, res, next) => {
    if (DEBUG_REQUESTS) {
        console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
        console.log('Headers:', JSON.stringify(req.headers, null, 2));
    }
    next();
});

// Enhanced CORS configuration for Flutter app
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'request-id'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increased for multiple ID card images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Log body summary avoiding large base64 dumps
app.use((req, res, next) => {
    if (DEBUG_REQUESTS && req.body && Object.keys(req.body).length > 0) {
        const bodyCopy = { ...req.body };
        // Truncate potential large fields for logging
        if (bodyCopy.registrationData) {
            bodyCopy.registrationData = '{...}';
        }
        if (bodyCopy.profileImage) bodyCopy.profileImage = '[BASE64_IMAGE]';
        if (bodyCopy.signatureImage) bodyCopy.signatureImage = '[BASE64_SIGNATURE]';
        if (bodyCopy.idFrontImage) bodyCopy.idFrontImage = '[BASE64_ID_FRONT]';
        if (bodyCopy.idBackImage) bodyCopy.idBackImage = '[BASE64_ID_BACK]';
        
        console.log('[DEBUG] Parsed Body:', JSON.stringify(bodyCopy, null, 2));
    }
    next();
});

// Serve static files (PDF bills)
const path = require('path');
app.use('/bills', express.static(path.join(__dirname, 'public', 'bills')));
app.use('/members', express.static(path.join(__dirname, 'public', 'members')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// 2. Connect only to the configured real MongoDB database.
// Why fallback exists:
// - Atlas may be temporarily unreachable (network issues, IP not whitelisted)
// - Allows development to continue with local MongoDB
// - Production should always use Atlas (whitelist server IP in Atlas dashboard)
//
// To whitelist your IP for Atlas:
// 1. Go to MongoDB Atlas → Network Access
// 2. Click "Add IP Address"
// 3. Add your current IP or use 0.0.0.0/0 for testing (not recommended for production)

const MONGODB_URI = process.env.MONGODB_URI;

const connectDB = async () => {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is not set');
    }

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected to real database!');
};

// 3. Models are imported from separate files to avoid conflicts
// All models defined in ./models/ directory

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
app.use('/api/branches', branchRoutes);

// Admin Routes
app.use('/api/admin', adminRoutes);

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

// Global Error Handler
app.use(errorHandler);

// Root Route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// 5. Start Server after DB is ready
(async () => {
    try {
        await connectDB();
    } catch (err) {
        console.error(`DB Connection failed, stopping server: ${err.message}`);
        process.exit(1);
    }
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

    // Initialize Socket.io
    const { initSocket } = require('./utils/socketService');
    initSocket(server);
})().catch((err) => {
    console.error(`Startup failure: ${err.message}`);
    process.exit(1);
});
