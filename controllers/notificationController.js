const Notification = require('../models/Notification');

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

        const notifications = await Notification.find({ userId, branchId: req.user.branchId })
            .sort({ date: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, count: notifications.length, data: notifications });
    } catch (error) {
        console.error('[getMyNotifications] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
    }
};

const FieldVisitor = require('../models/FieldVisitor');

// @desc    Create a notification
// @route   POST /api/notifications
// @access  Private
const createNotification = async (req, res) => {
    console.log('[createNotification] Request received:', req.body);
    try {
        const { title, body, date, sendToAll, recipientId } = req.body;
        const userId = req.user?._id;
        const userRole = req.user?.role;
        const branchId = req.user?.branchId; // Get branchId from logged in manager

        console.log('[createNotification] User:', userId, 'Role:', userRole);

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const notificationsToCreate = [];

        // Manager sending to Field Visitors
        if (userRole === 'manager') {
            if (sendToAll) {
                // Find all field visitors in this branch
                const visitors = await FieldVisitor.find({ branchId }).select('_id');
                console.log(`[createNotification] Sending to all ${visitors.length} visitors in branch ${branchId}`);

                for (const visitor of visitors) {
                    notificationsToCreate.push({
                        title,
                        body,
                        date: date || Date.now(),
                        userId: visitor._id, // The recipient
                        userRole: 'field_visitor', // Role of recipient
                        fieldVisitorId: visitor._id,
                        managerId: userId, // Sender
                        isRead: false
                    });
                }
            } else if (recipientId) {
                // Send to specific field visitor
                console.log(`[createNotification] Sending to specific visitor ${recipientId}`);
                notificationsToCreate.push({
                    title,
                    body,
                    date: date || Date.now(),
                    userId: recipientId, // The recipient
                    userRole: 'field_visitor',
                    fieldVisitorId: recipientId,
                    managerId: userId, // Sender
                    isRead: false
                });
            } else {
                // Fallback: create for self (Manager) - useful for testing or personal notes
                notificationsToCreate.push({
                    title,
                    body,
                    date: date || Date.now(),
                    userId,
                    userRole,
                    managerId: userId,
                    isRead: false
                });
            }
        } else {
            // Field Visitor creating notification (typically for self or system)
            notificationsToCreate.push({
                title,
                body,
                date: date || Date.now(),
                userId,
                userRole,
                fieldVisitorId: userId,
                isRead: false
            });
        }

        if (notificationsToCreate.length > 0) {
            const savedNotifications = await Notification.insertMany(notificationsToCreate);
            console.log('[createNotification] Created:', savedNotifications.length, 'notifications');
            res.status(201).json({ success: true, count: savedNotifications.length, data: savedNotifications });
        } else {
            res.status(200).json({ success: true, message: 'No recipients found', data: [] });
        }

    } catch (error) {
        console.error('[createNotification] Error:', error.message);
        res.status(500).json({ success: false, message: 'Failed to create notification', error: error.message });
    }
};

module.exports = { getMyNotifications, createNotification };
