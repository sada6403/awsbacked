const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const Note = require('../models/Note');

// GET /api/debug/totals
// Optional query: ?branchId=...
const getTotals = async (req, res) => {
  try {
    const { branchId } = req.query;
    const match = {};
    if (branchId) match.branchId = branchId;

    const agg = await Transaction.aggregate([
      { $match: match },
      { $group: { _id: '$type', totalAmount: { $sum: '$totalAmount' }, totalQuantity: { $sum: '$quantity' }, count: { $sum: 1 } } }
    ]);

    const result = {
      buy: { totalAmount: 0, totalQuantity: 0, count: 0 },
      sell: { totalAmount: 0, totalQuantity: 0, count: 0 },
      overall: { totalAmount: 0, totalQuantity: 0, count: 0 }
    };

    (agg || []).forEach(item => {
      const key = item._id;
      if (key === 'buy' || key === 'sell') {
        result[key].totalAmount = item.totalAmount || 0;
        result[key].totalQuantity = item.totalQuantity || 0;
        result[key].count = item.count || 0;
        result.overall.totalAmount += result[key].totalAmount;
        result.overall.totalQuantity += result[key].totalQuantity;
        result.overall.count += result[key].count;
      }
    });

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[debug:getTotals] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to compute totals', error: error.message });
  }
};

// GET /api/debug/notifications
const getAllNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ date: -1 }).lean();
    return res.json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    console.error('[debug:getAllNotifications] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications', error: error.message });
  }
};

// GET /api/debug/notes
const getAllNotes = async (req, res) => {
  try {
    const notes = await Note.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, count: notes.length, data: notes });
  } catch (error) {
    console.error('[debug:getAllNotes] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notes', error: error.message });
  }
};

// GET /api/debug/all
const getAll = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 }).limit(200).lean();
    const notifications = await Notification.find().sort({ date: -1 }).limit(200).lean();
    const notes = await Note.find().sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ success: true, data: { transactions, notifications, notes } });
  } catch (error) {
    console.error('[debug:getAll] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch debug data', error: error.message });
  }
};

module.exports = { getTotals, getAllNotifications, getAllNotes, getAll };