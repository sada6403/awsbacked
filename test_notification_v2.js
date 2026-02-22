const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { sendPushNotification, initializeFCM } = require('./utils/pushNotification');

dotenv.config();

async function sendTest() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        initializeFCM();

        // 1. Check for BranchManager with Token
        const BranchManager = mongoose.model('BranchManager', new mongoose.Schema({ fcmToken: String, fullName: String }));
        const mgr = await BranchManager.findOne({ fcmToken: { $exists: true, $ne: null } });

        let target = mgr;
        let role = 'Manager';

        if (!target) {
            // 2. Check for FieldVisitor with Token
            const FieldVisitor = mongoose.model('FieldVisitor', new mongoose.Schema({ fcmToken: String, name: String }));
            target = await FieldVisitor.findOne({ fcmToken: { $exists: true, $ne: null } });
            role = 'Field Visitor';
        }

        if (target && target.fcmToken) {
            console.log(`Sending test notification to ${role}: ${target.fullName || target.name}`);
            const result = await sendPushNotification(
                target.fcmToken,
                'Test Notification 🚀',
                'Hello! This is a test notification from the system to verify push delivery.',
                { type: 'TEST', timestamp: new Date().toISOString() }
            );

            if (result) {
                console.log('Test notification sent successfully!');
            } else {
                console.error('Failed to send notification. Check logs for FCM initialization errors.');
            }
        } else {
            console.warn('No users found with an active FCM token. Please log in to the mobile app first to register your device.');
        }

    } catch (error) {
        console.error('Error running test:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

sendTest();
