const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const AdminUser = require('../../models/AdminUser');
const BranchManager = require('../../models/BranchManager');
const CompanyTransfer = require('../../models/CompanyTransfer');
const FieldVisitor = require('../../models/FieldVisitor');
const sendEmail = require('../../utils/emailService');
const { resolveRequestedBranchCodes } = require('../../utils/adminBranchFilters');
const {
  createWalletTransaction,
  getUserMeta,
  loadBranchDirectory,
  loadWalletUsersByBranchCodes,
  startOptionalSession,
} = require('../../utils/walletAdminHelpers');

function normalizeTransferStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'accepted') return 'approved';
  return value || 'pending';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(value) {
  return `LKR ${Number(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
}

function buildTransferReceiptHtml(transfer, user, branch, note) {
  return `
    <div style="font-family:Arial,sans-serif;color:#101828">
      <h2>Nature Farming Company Transfer Receipt</h2>
      <p>Your company transfer has been approved.</p>
      <table style="border-collapse:collapse;width:100%;max-width:620px">
        <tr><td style="padding:8px;border:1px solid #e4e7ec">Deposit ID</td><td style="padding:8px;border:1px solid #e4e7ec"><strong>${transfer.depositId}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e4e7ec">Name</td><td style="padding:8px;border:1px solid #e4e7ec">${user.fullName || user.name || 'User'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e4e7ec">Branch</td><td style="padding:8px;border:1px solid #e4e7ec">${branch?.branchName || transfer.branchCode || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e4e7ec">Amount</td><td style="padding:8px;border:1px solid #e4e7ec">LKR ${Number(transfer.amount || 0).toLocaleString('en-LK')}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e4e7ec">Status</td><td style="padding:8px;border:1px solid #e4e7ec">Approved</td></tr>
      </table>
      ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
    </div>
  `;
}

// @route   GET /api/admin/company-transfers
// @desc    Get all company transfers
router.get('/', adminOnly, checkPermission('Company Transfers', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const { status, search } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const skip = (page - 1) * limit;
    let managers = [];
    let fieldVisitors = [];
    let userQuery = {};

    if (req.adminUser.role !== 'SuperAdmin' || branchCodes.length > 0) {
      const scopedUsers = await loadWalletUsersByBranchCodes(branchCodes);
      managers = scopedUsers.managers;
      fieldVisitors = scopedUsers.fieldVisitors;
      const managerIds = managers.map((user) => String(user._id));
      const fvIds = fieldVisitors.map((user) => String(user._id));
      userQuery = {
        $or: [
          { userModel: 'BranchManager', userId: { $in: managerIds } },
          { userModel: 'FieldVisitor', userId: { $in: fvIds } },
        ],
      };
    }

    if (status) {
      const statuses = String(status).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      userQuery.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    const [transfers, total] = await Promise.all([
      CompanyTransfer.find(userQuery).select('-receiptUrl').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CompanyTransfer.countDocuments(userQuery),
    ]);

    if (req.adminUser.role === 'SuperAdmin' && branchCodes.length === 0) {
      const managerIds = transfers
        .filter((transfer) => transfer.userModel === 'BranchManager')
        .map((transfer) => transfer.userId);
      const fvIds = transfers
        .filter((transfer) => transfer.userModel === 'FieldVisitor')
        .map((transfer) => transfer.userId);
      [managers, fieldVisitors] = await Promise.all([
        managerIds.length
          ? BranchManager.find({ _id: { $in: managerIds } }, 'fullName name email phone branchId walletBalance status').lean()
          : [],
        fvIds.length
          ? FieldVisitor.find({ _id: { $in: fvIds } }, 'fullName name email phone branchId walletBalance status managerId').lean()
          : [],
      ]);
    }

    const approverIds = Array.from(
      new Set(
        transfers
          .flatMap((transfer) => [transfer.approvedBy, transfer.rejectedBy])
          .filter((value) => mongoose.Types.ObjectId.isValid(value))
          .map((value) => String(value))
      )
    );
    const approvers = approverIds.length
      ? await AdminUser.find({ _id: { $in: approverIds } }, 'name email').lean()
      : [];
    const approverMap = new Map(approvers.map((item) => [String(item._id), item]));

    const branchDirectory = await loadBranchDirectory();
    const managerMap = new Map(managers.map((item) => [String(item._id), item]));
    const fvMap = new Map(fieldVisitors.map((item) => [String(item._id), item]));

    const data = transfers
      .map((transfer) => {
        const user = transfer.userModel === 'BranchManager' ? managerMap.get(String(transfer.userId)) : fvMap.get(String(transfer.userId));
        const branchCode = transfer.branchCode || user?.branchId || null;
        const branch = branchCode ? branchDirectory.get(branchCode) : null;
        const approvedBy = transfer.approvedBy ? approverMap.get(String(transfer.approvedBy)) || transfer.approvedBy : null;
        const rejectedBy = transfer.rejectedBy ? approverMap.get(String(transfer.rejectedBy)) || transfer.rejectedBy : null;
        return {
          ...transfer,
          depositId: transfer.depositId || `TRF-${String(transfer._id).slice(-6).toUpperCase()}`,
          status: normalizeTransferStatus(transfer.status),
          userName: user?.fullName || user?.name || 'Unknown User',
          userEmail: user?.email || null,
          userPhone: user?.phone || null,
          branchCode: branch?.branchCode || branchCode,
          branchId: branch?.branchId || transfer.branchId || null,
          branchName: branch?.branchName || branchCode,
          slipUrl: transfer.receiptUrl,
          transferLogs: transfer.logs || [],
          approvedBy,
          rejectedBy,
        };
      })
      .filter((transfer) => {
        if (!search) return true;
        return JSON.stringify(transfer).toLowerCase().includes(String(search).trim().toLowerCase());
      });

    res.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Fetch Company Transfers Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/company-transfers/:id/slip
// @desc    Get a normalized image src for the deposit slip
router.get('/:id/slip', adminOnly, checkPermission('Company Transfers', 'view'), async (req, res) => {
  try {
    const transfer = await CompanyTransfer.findById(req.params.id).select('receiptUrl branchCode branchId').lean();
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, { branchCode: transfer.branchCode || transfer.branchId });
    if (req.adminUser.role !== 'SuperAdmin' && branchCodes.length > 0 && !branchCodes.includes(transfer.branchCode || transfer.branchId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const raw = transfer.receiptUrl;
    let imageSrc = null;

    if (raw) {
      if (raw.startsWith('data:')) {
        imageSrc = raw;
      } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
        // S3 URL or external URL — use directly
        imageSrc = raw;
      } else if (raw.startsWith('/')) {
        // Local file path (/uploads/...) — prefix with backend origin
        imageSrc = `${req.protocol}://${req.get('host')}${raw}`;
      } else {
        // Raw base64 — detect JPEG (/9j/) vs PNG (iVBOR) vs default to JPEG
        const mime = raw.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
        imageSrc = `data:${mime};base64,${raw}`;
      }
    }

    res.json({ success: true, imageSrc });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/company-transfers/:id/receipt
// @desc    Get printable company transfer receipt
router.get('/:id/receipt', adminOnly, checkPermission('Company Transfers', 'view'), async (req, res) => {
  try {
    const transfer = await CompanyTransfer.findById(req.params.id).lean();
    if (!transfer) return res.status(404).send('Company transfer not found');

    const transferBranchCode = transfer.branchCode || transfer.branchId;
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, {
      branchCode: transfer.branchCode || transfer.branchId,
    });
    if (req.adminUser.role !== 'SuperAdmin' && (!transferBranchCode || !branchCodes.includes(transferBranchCode))) {
      return res.status(403).send('You cannot view this transfer');
    }

    const meta = getUserMeta(transfer.userModel);
    const [user, branchDirectory] = await Promise.all([
      meta.Model.findById(transfer.userId).lean(),
      loadBranchDirectory(),
    ]);
    const branch = branchDirectory.get(transfer.branchCode || transfer.branchId || user?.branchId);
    const depositId = transfer.depositId || `TRF-${String(transfer._id).slice(-6).toUpperCase()}`;
    const logoUrl = `${req.protocol}://${req.get('host')}/images/nf_logo.jpg`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename=${depositId}-receipt.html`);
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Transfer Receipt ${escapeHtml(depositId)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fb; color: #101828; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .actions { position: sticky; top: 0; padding: 10px; background: #101828; text-align: right; }
    .actions button { border: 0; border-radius: 8px; padding: 10px 14px; background: #0f766e; color: white; cursor: pointer; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 22mm; }
    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f766e; padding-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 58px; height: 58px; object-fit: cover; border-radius: 12px; border: 1px solid #e4e7ec; }
    h1 { margin: 0; font-size: 24px; }
    .muted { color: #667085; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
    .box { border: 1px solid #e4e7ec; border-radius: 10px; padding: 14px; }
    .box h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #0f766e; }
    .row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid #f2f4f7; font-size: 13px; }
    .total { margin-top: 18px; display: flex; justify-content: flex-end; }
    .total div { min-width: 260px; border-radius: 10px; background: #0f766e; color: white; padding: 16px; }
    .timeline { margin-top: 22px; }
    .log { border-left: 3px solid #0f766e; margin-top: 10px; padding: 8px 0 8px 12px; }
    @media print { body { background: white; } .actions { display: none; } .page { width: auto; min-height: auto; margin: 0; } }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Print / Save PDF</button></div>
  <main class="page">
    <section class="header">
      <div class="brand"><img src="${logoUrl}" alt="Nature Farming" /><div><h1>Nature Farming Transfer Receipt</h1><p class="muted">Company deposit confirmation</p></div></div>
      <div style="text-align:right"><h1>${escapeHtml(depositId)}</h1><p class="muted">${escapeHtml(new Date(transfer.createdAt).toLocaleString('en-GB'))}</p></div>
    </section>
    <section class="grid">
      <div class="box"><h2>Requester</h2><div class="row"><span>Name</span><strong>${escapeHtml(user?.fullName || user?.name || 'Unknown')}</strong></div><div class="row"><span>Role</span><strong>${escapeHtml(transfer.userRole)}</strong></div><div class="row"><span>Phone</span><strong>${escapeHtml(user?.phone || '-')}</strong></div></div>
      <div class="box"><h2>Branch</h2><div class="row"><span>Name</span><strong>${escapeHtml(branch?.branchName || transfer.branchCode || '-')}</strong></div><div class="row"><span>Code</span><strong>${escapeHtml(branch?.branchCode || transfer.branchCode || '-')}</strong></div><div class="row"><span>ID</span><strong>${escapeHtml(branch?.branchId || transfer.branchId || '-')}</strong></div></div>
      <div class="box"><h2>Depositor</h2><div class="row"><span>Name</span><strong>${escapeHtml(transfer.depositorName)}</strong></div><div class="row"><span>NIC</span><strong>${escapeHtml(transfer.depositorNic)}</strong></div><div class="row"><span>Deposit ID</span><strong>${escapeHtml(depositId)}</strong></div></div>
      <div class="box"><h2>Status</h2><div class="row"><span>Status</span><strong>${escapeHtml(normalizeTransferStatus(transfer.status))}</strong></div><div class="row"><span>Approved At</span><strong>${escapeHtml(transfer.approvedAt ? new Date(transfer.approvedAt).toLocaleString('en-GB') : '-')}</strong></div><div class="row"><span>Receipt Sent</span><strong>${escapeHtml(transfer.receiptSentAt ? new Date(transfer.receiptSentAt).toLocaleString('en-GB') : '-')}</strong></div></div>
    </section>
    <div class="total"><div><span>Transfer Amount</span><h1>${escapeHtml(formatMoney(transfer.amount))}</h1></div></div>
    <section class="timeline"><h2>Transfer History</h2>${(transfer.logs || []).map((log) => `<div class="log"><strong>${escapeHtml(log.status || 'log')}</strong><p>${escapeHtml(log.note || '')}</p><p class="muted">${escapeHtml(log.actorName || '')} ${escapeHtml(log.createdAt ? new Date(log.createdAt).toLocaleString('en-GB') : '')}</p></div>`).join('') || '<p class="muted">No transfer logs recorded.</p>'}</section>
  </main>
</body>
</html>`);
  } catch (error) {
    res.status(error.statusCode || 500).send(error.message || 'Server Error');
  }
});

// @route   POST /api/admin/company-transfers
// @desc    Create a new company transfer record
router.post('/', adminOnly, checkPermission('Company Transfers', 'create'), auditLog('Company Transfers', 'CREATE'), async (req, res) => {
  try {
    const transferData = {
      ...req.body,
      createdBy: req.adminUser.id,
      logs: [{ status: 'pending', note: 'Transfer created by admin', actorId: req.adminUser._id, actorName: req.adminUser.name }],
    };
    const newTransfer = new CompanyTransfer(transferData);
    const savedTransfer = await newTransfer.save();
    res.status(201).json({ success: true, data: savedTransfer });
  } catch (error) {
    console.error('Create Transfer Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/company-transfers/:id/approve
// @desc    Approve a transfer
router.post('/:id/approve', adminOnly, checkPermission('Company Transfers', 'approve'), auditLog('Company Transfers', 'APPROVE'), async (req, res) => {
  let session = null;

  try {
    const { reason } = req.body;
    session = await startOptionalSession();
    const sessionOptions = session ? { session } : undefined;

    const transfer = await CompanyTransfer.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        $set: {
          status: 'approved',
          approvedBy: req.adminUser._id,
          approvedAt: new Date(),
          rejectionReason: undefined,
        },
        $push: { logs: { status: 'approved', note: reason || 'Transfer approved', actorId: req.adminUser._id, actorName: req.adminUser.name } },
      },
      { new: true, ...(sessionOptions || {}) }
    );

    if (!transfer) {
      throw Object.assign(new Error('Transfer not found or already processed'), { statusCode: 400 });
    }

    const meta = getUserMeta(transfer.userModel);
    const user = await meta.Model.findById(transfer.userId, null, sessionOptions);
    if (!user) {
      throw Object.assign(new Error('Transfer owner not found'), { statusCode: 404 });
    }
    if (Number(user.walletBalance || 0) < Number(transfer.amount)) {
      throw Object.assign(new Error('Insufficient wallet balance for this transfer'), { statusCode: 400 });
    }

    user.walletBalance = Number(user.walletBalance || 0) - Number(transfer.amount);
    await user.save(sessionOptions);

    await createWalletTransaction({
      session,
      userId: user._id,
      userModel: meta.userModel,
      type: 'transfer_out',
      amount: transfer.amount,
      balanceAfter: user.walletBalance,
      reference: reason || `Company transfer approved by ${req.adminUser.name}`,
    });

    const branchDirectory = await loadBranchDirectory();
    const branch = branchDirectory.get(transfer.branchCode || user.branchId);
    if (user.email) {
      try {
        await sendEmail(
          user.email,
          `Nature Farming transfer receipt ${transfer.depositId}`,
          buildTransferReceiptHtml(transfer, user, branch, reason)
        );
        transfer.receiptSentAt = new Date();
        transfer.receiptSendError = undefined;
      } catch (emailError) {
        transfer.receiptSendError = emailError.message;
      }
      await transfer.save(sessionOptions);
    }

    if (session) {
      await session.commitTransaction();
    }

    res.json({
      success: true,
      data: {
        _id: transfer._id,
        status: transfer.status,
        approvedAt: transfer.approvedAt,
        depositId: transfer.depositId,
        receiptSentAt: transfer.receiptSentAt,
        receiptSendError: transfer.receiptSendError,
        walletBalance: user.walletBalance,
      },
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  } finally {
    if (session) session.endSession();
  }
});

// @route   POST /api/admin/company-transfers/:id/reject
// @desc    Reject a transfer
router.post('/:id/reject', adminOnly, checkPermission('Company Transfers', 'reject'), auditLog('Company Transfers', 'REJECT'), async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const transfer = await CompanyTransfer.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          rejectedBy: req.adminUser._id,
          rejectedAt: new Date(),
          rejectionReason: reason,
        },
        $push: { logs: { status: 'rejected', note: reason, actorId: req.adminUser._id, actorName: req.adminUser.name } },
      },
      { new: true }
    );
    if (!transfer) return res.status(400).json({ message: 'Transfer not found or already processed' });
    res.json({ success: true, data: transfer });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
