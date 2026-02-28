const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let fcmInitialized = false;

const initializeFCM = () => {
    try {
        const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
        if (fs.existsSync(serviceAccountPath)) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath)
            });
            fcmInitialized = true;
            console.log('FCM Initialized successfully');
        } else {
            console.warn('FCM Service Account Key not found at ' + serviceAccountPath + '. Push notifications will be disabled.');
        }
    } catch (error) {
        console.error('Error initializing FCM:', error.message);
    }
};

const sendPushNotification = async (token, title, body, data = {}) => {
    if (!fcmInitialized || !token) {
        if (!token) console.warn('[sendPushNotification] Skipping: No token provided');
        if (!fcmInitialized) console.warn('[sendPushNotification] Skipping: FCM not initialized');
        return;
    }

    const message = {
        token: token,
        notification: {
            title: title,
            body: body,
        },
        data: {
            ...data,
            click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'high_importance_channel_with_sound',
                sound: 'default',
                defaultSound: true,
                defaultVibrateTimings: true,
                notificationPriority: 'PRIORITY_MAX'
            }
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1
                }
            }
        }
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Successfully sent push notification:', response);
        return response;
    } catch (error) {
        console.error('Error sending push notification:', error.message);
        // Don't throw to prevent crashing the main request flow
        return null;
    }
};

module.exports = { initializeFCM, sendPushNotification };
