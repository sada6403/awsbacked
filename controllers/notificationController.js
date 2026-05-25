const Notification = require('../models/Notification');
const FieldVisitor = require('../models/FieldVisitor');
const BranchManager = require('../models/BranchManager');
const { sendManyAndPush } = require('../utils/notificationHelper');

// @desc    Get notifications for current user (manager or field visitor)
// @route   GET /api/notifications
// @access  Private
const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;
        const userRole = req.user?.role;
        if (!userId || !userRole) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const notifications = await Notification.find({ userId })
            .sort({ date: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, count: notifications.length, data: notifications });
    } catch (error) {
        console.error('[getMyNotifications] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
    }
};

// @desc    Create a notification
// @route   POST /api/notifications
// @access  Private
const createNotification = async (req, res) => {

    try {
        const { title, body, date, sendToAll, recipientId } = req.body;
        const userId = req.user?._id;
        const userRole = req.user?.role;
        const branchId = req.user?.branchId; // Get branchId from logged in manager



        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const notificationsToCreate = [];

        // Manager sending to Field Visitors
        if (userRole === 'manager' || userRole === 'branch_manager') {
            if (sendToAll) {
                // Find all field visitors in this branch
                const visitors = await FieldVisitor.find({ branchId }).select('_id');

                for (const visitor of visitors) {
                    notificationsToCreate.push({
                        title,
                        body,
                        date: date || Date.now(),
                        userId: visitor._id, // The recipient
                        userRole: 'field_visitor', // Role of recipient
                        fieldVisitorId: visitor._id,
                        managerId: userId, // Sender
                        branchId,
                        isRead: false
                    });
                }
            } else if (recipientId) {
                notificationsToCreate.push({
                    title,
                    body,
                    date: date || Date.now(),
                    userId: recipientId, // The recipient
                    userRole: 'field_visitor',
                    fieldVisitorId: recipientId,
                    managerId: userId, // Sender
                    branchId,
                    isRead: false
                });
            } else {
                // Fallback: create for self (Manager)
                notificationsToCreate.push({
                    title,
                    body,
                    date: date || Date.now(),
                    userId,
                    userRole,
                    managerId: userId,
                    branchId,
                    isRead: false
                });
            }
        } else {
            // Field Visitor creating notification
            notificationsToCreate.push({
                title,
                body,
                date: date || Date.now(),
                userId,
                userRole,
                fieldVisitorId: userId,
                branchId,
                isRead: false
            });

            // Automatically notify the Branch Manager(s)
            try {
                const managers = await BranchManager.find({ branchId });

                for (const manager of managers) {
                    notificationsToCreate.push({
                        title,
                        body,
                        date: date || Date.now(),
                        userId: manager._id, // Target the Manager
                        userRole: 'manager',
                        fieldVisitorId: userId, // From this FV
                        branchId,
                        isRead: false
                    });
                }
            } catch (err) {
                console.error('[createNotification] Error finding manager:', err.message);
            }
        }

        if (notificationsToCreate.length > 0) {
            const savedNotifications = await sendManyAndPush(notificationsToCreate);

            res.status(201).json({ success: true, count: savedNotifications.length, data: savedNotifications });
        } else {
            res.status(200).json({ success: true, message: 'No recipients found', data: [] });
        }

    } catch (error) {
        console.error('[createNotification] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create notification', error: error.message });
    }
};

// @desc    Mark all unread notifications as read for current user
// @route   PUT /api/notifications/mark-read
// @access  Private
const markNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const result = await Notification.updateMany(
            { userId, isRead: false },
            { $set: { isRead: true } }
        );

        res.json({
            success: true,
            message: 'Notifications marked as read',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('[markNotificationsAsRead] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to mark notifications as read', error: error.message });
    }
};

// @desc    Mark a single notification as read
// @route   PUT /api/notifications/:id/mark-read
// @access  Private
const markSingleNotificationAsRead = async (req, res) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const notificationId = req.params.id;

        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, userId },
            { $set: { isRead: true } },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: notification
        });
    } catch (error) {
        console.error('[markSingleNotificationAsRead] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read', error: error.message });
    }
};

module.exports = { getMyNotifications, createNotification, markNotificationsAsRead, markSingleNotificationAsRead };
