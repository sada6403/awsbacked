const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { sendPushNotification, initializeFCM } = require('./utils/pushNotification');

dotenv.config();

async function sendTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        initializeFCM();

        const db = mongoose.connection.db;

        // Check Managers
        const mgr = await db.collection('branchmanagers').findOne({ fcmToken: { $exists: true, $ne: null } });
        // Check Visitors
        const fv = await db.collection('fieldvisitors').findOne({ fcmToken: { $exists: true, $ne: null } });

        let target = mgr || fv;
        let role = mgr ? 'Manager' : (fv ? 'Field Visitor' : null);
        let name = mgr ? mgr.fullName : (fv ? fv.name : null);

        if (target && target.fcmToken) {
            console.log(`Sending test notification to ${role}: ${name}`);
            const result = await sendPushNotification(
                target.fcmToken,
                'Test Notification 🚀',
                'Hello! This is a test notification from the system to verify push delivery.',
                { type: 'TEST', timestamp: new Date().toISOString() }
            );

            if (result) {
                console.log('SUCCESS: Test notification sent!');
            } else {
                console.log('FAILURE: Failed to send notification.');
            }
        } else {
            console.log('FAILURE: No tokens found in DB. Please log in to the mobile app first.');
        }

    } catch (error) {
        console.error('ERROR:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

sendTest();
