const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const NotificationCampaign = require('../../models/NotificationCampaign');
const Member = require('../../models/Member');
const BranchManager = require('../../models/BranchManager');
const FieldVisitor = require('../../models/FieldVisitor');
const Notification = require('../../models/Notification');
const smsService = require('../../services/smsService');
const emailService = require('../../services/emailService');
const { sendManyAndPush } = require('../../utils/notificationHelper');
const { resolveRequestedBranchCodes } = require('../../utils/adminBranchFilters');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidPhone(value) {
  return /^\+?\d{9,15}$/.test(String(value || '').replace(/\s+/g, ''));
}

async function loadRecipients({ audienceType, branchCodes, specificEmail, specificPhone, specificUser }) {
  const branchFilter = branchCodes.length > 0 ? { branchId: { $in: branchCodes } } : {};

  if (audienceType === 'specific_email') {
    return [{ channel: 'email', email: specificEmail }];
  }
  if (audienceType === 'specific_phone') {
    return [{ channel: 'sms', phone: specificPhone }];
  }

  const [members, managers, visitors] = await Promise.all([
    Member.find(branchFilter, 'name email mobile branchId').lean(),
    BranchManager.find(branchFilter, 'fullName name email phone branchId').lean(),
    FieldVisitor.find(branchFilter, 'fullName name email phone branchId').lean(),
  ]);

  const recipientGroups = {
    all: [
      ...members.map((item) => ({ role: 'member', name: item.name, email: item.email, phone: item.mobile, branchId: item.branchId })),
      ...managers.map((item) => ({ role: 'manager', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
      ...visitors.map((item) => ({ role: 'field_visitor', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
    ],
    managers: managers.map((item) => ({ role: 'manager', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
    field_visitors: visitors.map((item) => ({ role: 'field_visitor', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
    members: members.map((item) => ({ role: 'member', name: item.name, email: item.email, phone: item.mobile, branchId: item.branchId })),
    branch: [
      ...members.map((item) => ({ role: 'member', name: item.name, email: item.email, phone: item.mobile, branchId: item.branchId })),
      ...managers.map((item) => ({ role: 'manager', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
      ...visitors.map((item) => ({ role: 'field_visitor', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
    ],
    specific_user: [
      ...managers.filter((item) => String(item._id) === String(specificUser)).map((item) => ({ role: 'manager', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
      ...visitors.filter((item) => String(item._id) === String(specificUser)).map((item) => ({ role: 'field_visitor', userId: item._id, name: item.fullName || item.name, email: item.email, phone: item.phone, branchId: item.branchId })),
    ],
  };

  return recipientGroups[audienceType] || [];
}

async function deliverCampaign({ title, message, type, recipients }) {
  let sentCount = 0;
  let failedCount = 0;

  if (type === 'app') {
    const pushPayload = recipients
      .filter((item) => item.userId && (item.role === 'manager' || item.role === 'field_visitor'))
      .map((item) => ({
        title: title || 'NF Notification',
        body: message,
        userId: item.userId,
        userRole: item.role === 'manager' ? 'branch_manager' : 'field_visitor',
        date: new Date(),
        branchId: item.branchId,
      }));
    await sendManyAndPush(pushPayload);
    sentCount = pushPayload.length;
    failedCount = recipients.length - sentCount;
  } else if (type === 'sms') {
    for (const recipient of recipients) {
      if (!recipient.phone) {
        failedCount += 1;
        continue;
      }
      const result = await smsService.sendGeneralSMS(recipient.phone, message);
      if (result.success) sentCount += 1;
      else failedCount += 1;
    }
  } else if (type === 'email') {
    for (const recipient of recipients) {
      if (!recipient.email) {
        failedCount += 1;
        continue;
      }
      const result = await emailService.sendEmail(recipient.email, title || 'NF Notification', message);
      if (result.success) sentCount += 1;
      else failedCount += 1;
    }
  }

  return { sentCount, failedCount };
}

router.get('/', adminOnly, checkPermission('Notifications', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const query = {};
    if (branchCodes.length > 0) {
      query.branchCode = { $in: branchCodes };
    }
    if (req.query.type) query.type = req.query.type;
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search).trim(), 'i');
      query.$or = [{ title: pattern }, { message: pattern }, { audienceType: pattern }];
    }

    const history = await NotificationCampaign.find(query)
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.post('/send', adminOnly, checkPermission('Notifications', 'create'), auditLog('Notifications', 'SEND'), async (req, res) => {
  try {
    const { title, message, audienceType, type, branchCode, specificEmail, specificPhone, specificUser } = req.body;
    if (!message || String(message).trim().length < 2) {
      return res.status(400).json({ message: 'Message content is required' });
    }
    if (!audienceType) {
      return res.status(400).json({ message: 'Audience type is required' });
    }
    if (!type) {
      return res.status(400).json({ message: 'Notification type is required' });
    }
    if (audienceType === 'specific_email' && !isValidEmail(specificEmail)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }
    if (audienceType === 'specific_phone' && !isValidPhone(specificPhone)) {
      return res.status(400).json({ message: 'Valid phone number is required' });
    }

    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, { branchCode });
    const recipients = await loadRecipients({ audienceType, branchCodes, specificEmail, specificPhone, specificUser });
    const { sentCount, failedCount } = await deliverCampaign({ title, message, type, recipients });
    const campaign = await NotificationCampaign.create({
      title,
      message,
      type,
      audienceType,
      branchCode: branchCodes[0],
      targetCount: recipients.length,
      sentCount,
      failedCount,
      status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
      sentBy: req.adminUser._id,
      specificEmail,
      specificPhone,
      metadata: { specificUser },
    });

    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.post('/bulk-sms', adminOnly, checkPermission('Bulk SMS / Email', 'create'), auditLog('Bulk SMS', 'SEND'), async (req, res) => {
  try {
    const payload = { ...req.body, type: 'sms', audienceType: req.body.audienceType || 'members' };
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, { branchCode: payload.branchCode });
    const recipients = await loadRecipients({
      audienceType: payload.audienceType,
      branchCodes,
      specificEmail: payload.specificEmail,
      specificPhone: payload.specificPhone,
      specificUser: payload.specificUser,
    });
    const { sentCount, failedCount } = await deliverCampaign({ title: payload.title, message: payload.message, type: 'sms', recipients });
    const campaign = await NotificationCampaign.create({
      title: payload.title,
      message: payload.message,
      type: 'sms',
      audienceType: payload.audienceType,
      branchCode: branchCodes[0],
      targetCount: recipients.length,
      sentCount,
      failedCount,
      status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
      sentBy: req.adminUser._id,
      specificPhone: payload.specificPhone,
      metadata: { specificUser: payload.specificUser },
    });
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Bulk SMS Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.post('/bulk-email', adminOnly, checkPermission('Bulk SMS / Email', 'create'), auditLog('Bulk Email', 'SEND'), async (req, res) => {
  try {
    const payload = { ...req.body, type: 'email', audienceType: req.body.audienceType || 'members' };
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, { branchCode: payload.branchCode });
    const recipients = await loadRecipients({
      audienceType: payload.audienceType,
      branchCodes,
      specificEmail: payload.specificEmail,
      specificPhone: payload.specificPhone,
      specificUser: payload.specificUser,
    });
    const { sentCount, failedCount } = await deliverCampaign({ title: payload.title, message: payload.message, type: 'email', recipients });
    const campaign = await NotificationCampaign.create({
      title: payload.title,
      message: payload.message,
      type: 'email',
      audienceType: payload.audienceType,
      branchCode: branchCodes[0],
      targetCount: recipients.length,
      sentCount,
      failedCount,
      status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
      sentBy: req.adminUser._id,
      specificEmail: payload.specificEmail,
      metadata: { specificUser: payload.specificUser },
    });
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Bulk Email Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
