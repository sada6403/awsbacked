const Notification = require('../models/Notification');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const { sendPushNotification } = require('./pushNotification');

/**
 * Creates a notification in the database and attempts to send a push notification.
 * @param {Object} notifData - The notification data matching the Notification model.
 */
const createAndSendNotification = async (notifData) => {
    try {
        const notification = await Notification.create({
            ...notifData,
            date: notifData.date || new Date(),
            isRead: false
        });

        // Find recipient's FCM token
        let user;
        if (notifData.userRole === 'manager' || notifData.userRole === 'branch_manager') {
            user = await BranchManager.findById(notifData.userId).select('fcmToken');
        } else {
            user = await FieldVisitor.findById(notifData.userId).select('fcmToken');
        }

        if (user && user.fcmToken) {
            console.log(`[notificationHelper] Sending push to user ${notifData.userId} (${notifData.userRole})`);
            await sendPushNotification(user.fcmToken, notifData.title, notifData.body, {
                notificationId: notification._id.toString(),
                type: 'notification'
            });
        } else {
            console.log(`[notificationHelper] No fcmToken found for user ${notifData.userId}`);
        }

        return notification;
    } catch (error) {
        console.error('[notificationHelper] Error:', error.message);
        // Fallback: if notification creation failed, we return null. 
        // If push failed, notification is already created.
    }
};

/**
 * Creates multiple notifications and sends pushes to all recipients.
 * @param {Array} notifList - Array of notification data objects.
 */
const sendManyAndPush = async (notifList) => {
    try {
        if (!notifList || notifList.length === 0) return [];

        // 1. Save all to DB
        const savedNotifications = await Notification.insertMany(notifList.map(n => ({
            ...n,
            date: n.date || new Date(),
            isRead: false
        })));

        // 2. Resolve tokens and send pushes
        // Optimization: Fetch unique user tokens first
        const userIdsByRole = {
            manager: [],
            field_visitor: []
        };

        notifList.forEach(n => {
            const role = (n.userRole === 'manager' || n.userRole === 'branch_manager') ? 'manager' : 'field_visitor';
            userIdsByRole[role].push(n.userId);
        });

        const [managers, visitors] = await Promise.all([
            BranchManager.find({ _id: { $in: userIdsByRole.manager } }).select('_id fcmToken'),
            FieldVisitor.find({ _id: { $in: userIdsByRole.field_visitor } }).select('_id fcmToken')
        ]);

        const tokenMap = new Map();
        managers.forEach(m => tokenMap.set(m._id.toString(), m.fcmToken));
        visitors.forEach(v => tokenMap.set(v._id.toString(), v.fcmToken));

        // 3. Trigger pushes
        notifList.forEach(n => {
            const token = tokenMap.get(n.userId.toString());
            if (token) {
                sendPushNotification(token, n.title, n.body, {
                    type: 'notification'
                });
            }
        });

        return savedNotifications;
    } catch (error) {
        console.error('[notificationHelper] sendManyAndPush Error:', error.message);
        return [];
    }
};

module.exports = { createAndSendNotification, sendManyAndPush };
