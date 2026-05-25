const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const Branch = require('../../models/Branch');
const BranchManager = require('../../models/BranchManager');
const BranchProduct = require('../../models/BranchProduct');
const FieldVisitor = require('../../models/FieldVisitor');
const Member = require('../../models/Member');
const ExtraMember = require('../../models/ExtraMember');
const ManagersMember = require('../../models/ManagersMember');
const Product = require('../../models/Product');
const Transaction = require('../../models/Transaction');
const { applyBranchFilters } = require('../../utils/adminBranchFilters');
const { resolveOfficialBranch } = require('../../utils/branchMaster');

function escapeCsv(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReportDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-LK');
}

function buildTransactionsReportHtml(transactions) {
  const total = transactions.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const generatedAt = new Date().toLocaleString('en-LK');
  const rows = transactions.map((transaction) => `
    <tr>
      <td>${escapeHtml(transaction.billNumber || '-')}</td>
      <td><span class="pill">${escapeHtml(transaction.type || '-')}</span></td>
      <td>${escapeHtml(transaction.productName || '-')}</td>
      <td>${escapeHtml(transaction.branchId || '-')}</td>
      <td class="amount">LKR ${Number(transaction.totalAmount || 0).toLocaleString('en-LK')}</td>
      <td>${escapeHtml(transaction.status || '-')}</td>
      <td>${escapeHtml(formatReportDate(transaction.date || transaction.createdAt))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Nature Farming Transaction Report</title>
      <style>
        @page { size: A4 landscape; margin: 14mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: Inter, Arial, sans-serif;
          color: #111827;
          background: #f8fafc;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page { padding: 28px; }
        .header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          border-bottom: 1px solid #dbe3ef;
          padding-bottom: 18px;
          margin-bottom: 18px;
        }
        .brand { color: #0f766e; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 800; }
        h1 { margin: 8px 0 4px; font-size: 26px; color: #0f172a; }
        .meta { color: #64748b; font-size: 13px; }
        .print-button {
          border: 0;
          border-radius: 12px;
          background: #10b981;
          color: #052e2b;
          padding: 12px 18px;
          font-weight: 800;
          cursor: pointer;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(180px, 1fr));
          gap: 14px;
          margin: 18px 0;
        }
        .card {
          border: 1px solid #dbe3ef;
          border-radius: 16px;
          background: #ffffff;
          padding: 16px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
        }
        .label { color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
        .value { margin-top: 8px; font-size: 24px; font-weight: 800; color: #0f172a; }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          border: 1px solid #dbe3ef;
          border-radius: 16px;
          background: #ffffff;
        }
        th, td { padding: 11px 12px; text-align: left; font-size: 12px; border-bottom: 1px solid #e5edf6; }
        th { background: #ecfdf5; color: #0f766e; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
        tr:last-child td { border-bottom: 0; }
        .amount { font-weight: 800; color: #0f172a; }
        .pill { border-radius: 999px; background: #e6f7f1; color: #0f766e; padding: 4px 9px; font-weight: 800; }
        @media print {
          body { background: #ffffff; }
          .page { padding: 0; }
          .print-button { display: none; }
          .card, table { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="header">
          <div>
            <div class="brand">Nature Farming Management</div>
            <h1>Transaction Report</h1>
            <div class="meta">Generated ${escapeHtml(generatedAt)} · Showing latest ${transactions.length} records</div>
          </div>
          <button class="print-button" onclick="window.print()">Print / Save PDF</button>
        </section>
        <section class="summary">
          <div class="card"><div class="label">Total Records</div><div class="value">${transactions.length.toLocaleString('en-LK')}</div></div>
          <div class="card"><div class="label">Total Amount</div><div class="value">LKR ${total.toLocaleString('en-LK')}</div></div>
        </section>
        <table>
          <thead><tr><th>Bill</th><th>Type</th><th>Product</th><th>Branch</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7">No records available.</td></tr>'}</tbody>
        </table>
      </main>
      <script>setTimeout(function(){ window.print(); }, 250);</script>
    </body>
  </html>`;
}

function buildDateMatch(query, field = 'createdAt') {
  const from = query.dateFrom || query.startDate;
  const to = query.dateTo || query.endDate;
  if (!from && !to) return {};
  const date = {};
  if (from) date.$gte = new Date(from);
  if (to) date.$lte = new Date(to);
  return { [field]: date };
}

async function getBranchNameMap(branchCodes) {
  const filtered = branchCodes.filter(Boolean);
  // Resolve each code to its official branch entry (handles legacy IDs like BR-KA-002)
  const officialMap = new Map(filtered.map((code) => [code, resolveOfficialBranch(code)]));
  const canonicalCodes = [...new Set(filtered.map((code) => officialMap.get(code)?.branchCode ?? code))];
  const dbBranches = await Branch.find({ branchCode: { $in: canonicalCodes } }, 'branchCode branchName').lean();
  const dbMap = new Map(dbBranches.map((b) => [b.branchCode, b.branchName]));
  const result = new Map();
  filtered.forEach((code) => {
    const official = officialMap.get(code);
    // Official branch name always wins (keeps names in sync with branchMaster)
    result.set(code, official?.branchName ?? dbMap.get(code) ?? code);
  });
  return result;
}

function textMatch(search, fields) {
  if (!search) return {};
  const pattern = new RegExp(String(search).trim(), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

function formatMoneyValue(value) {
  return `LKR ${Number(value || 0).toLocaleString('en-LK')}`;
}

function summarizeTransaction(transaction, memberMap = new Map(), visitorMap = new Map()) {
  const member = memberMap.get(String(transaction.memberId));
  const visitor = visitorMap.get(String(transaction.fieldVisitorId));
  const worker = visitor ? visitor.fullName || visitor.name || visitor.userId : 'Manager / direct';
  const memberName = member ? member.name || member.fullName || member.memberCode : transaction.memberModel || 'Member';
  return [
    formatReportDate(transaction.date || transaction.createdAt),
    transaction.billNumber || '-',
    String(transaction.type || '-').toUpperCase(),
    transaction.productName || '-',
    `${transaction.quantity || 0} ${transaction.unitType || ''}`.trim(),
    formatMoneyValue(transaction.totalAmount),
    `member: ${memberName || '-'}`,
    `worker: ${worker || '-'}`,
  ].join(' | ');
}

function getTxStats(statsMap, id) {
  return statsMap.get(String(id)) || {
    transactionCount: 0,
    totalAmount: 0,
    buyCount: 0,
    buyAmount: 0,
    sellCount: 0,
    sellAmount: 0,
  };
}

async function getMemberLookup(transactions) {
  const idsByModel = {
    Member: [],
    ExtraMember: [],
    ManagersMember: [],
  };

  transactions.forEach((transaction) => {
    const model = transaction.memberModel || 'Member';
    if (idsByModel[model]) idsByModel[model].push(transaction.memberId);
  });

  const [members, extras, managerMembers] = await Promise.all([
    idsByModel.Member.length ? Member.find({ _id: { $in: idsByModel.Member } }, 'name memberCode mobile nic branchId').lean() : [],
    idsByModel.ExtraMember.length ? ExtraMember.find({ _id: { $in: idsByModel.ExtraMember } }, 'name memberCode mobile nic branchId').lean() : [],
    idsByModel.ManagersMember.length ? ManagersMember.find({ _id: { $in: idsByModel.ManagersMember } }, 'name memberCode mobile nic branchId').lean() : [],
  ]);

  return new Map([...members, ...extras, ...managerMembers].map((member) => [String(member._id), member]));
}

async function buildTransactionMatch(adminUser, query) {
  const match = await applyBranchFilters(adminUser, query, {}, 'branchId');
  const from = query.dateFrom || query.startDate;
  const to = query.dateTo || query.endDate;

  if (query.branchId && query.branchId !== 'all' && !query.branchCode) {
    match.branchId = query.branchId;
  }
  if (query.type) {
    match.type = String(query.type).trim().toLowerCase();
  }
  if (query.status) {
    match.status = String(query.status).trim().toLowerCase();
  }
  if (query.product) {
    match.productName = new RegExp(String(query.product).trim(), 'i');
  }
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }

  return match;
}

// @route   GET /api/admin/reports/branches
// @desc    Generate branches report data
router.get('/branches', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const branchQuery = await applyBranchFilters(req.adminUser, req.query, {}, 'branchCode');
    const branches = await Branch.find(branchQuery).sort({ branchName: 1 }).lean();

    const branchCodes = branches.map((branch) => branch.branchCode);
    const stats = await Transaction.aggregate([
      { $match: { branchId: { $in: branchCodes } } },
      {
        $group: {
          _id: '$branchId',
          totalAmount: { $sum: '$totalAmount' },
          buyCount: { $sum: { $cond: [{ $in: ['$type', ['buy', 'Buy', 'BUY']] }, 1, 0] } },
          sellCount: { $sum: { $cond: [{ $in: ['$type', ['sell', 'Sell', 'SELL']] }, 1, 0] } },
        },
      },
    ]);

    const statsMap = new Map(stats.map((item) => [item._id, item]));
    res.json({
      success: true,
      data: branches.map((branch) => ({
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        branchId: branch.branchId,
        status: branch.status,
        totalAmount: statsMap.get(branch.branchCode)?.totalAmount || 0,
        totalBuyTransactions: statsMap.get(branch.branchCode)?.buyCount || 0,
        totalSellTransactions: statsMap.get(branch.branchCode)?.sellCount || 0,
        createdAt: branch.createdAt,
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/reports/transactions
// @desc    Generate transactions report data
router.get('/transactions', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const match = await buildTransactionMatch(req.adminUser, req.query);

    const stats = await Transaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            branchId: '$branchId',
            type: { $toLower: '$type' },
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
      {
        $group: {
          _id: '$_id.branchId',
          count: { $sum: '$count' },
          totalAmount: { $sum: '$totalAmount' },
          buyCount: { $sum: { $cond: [{ $eq: ['$_id.type', 'buy'] }, '$count', 0] } },
          sellCount: { $sum: { $cond: [{ $eq: ['$_id.type', 'sell'] }, '$count', 0] } },
          buyAmount: { $sum: { $cond: [{ $eq: ['$_id.type', 'buy'] }, '$totalAmount', 0] } },
          sellAmount: { $sum: { $cond: [{ $eq: ['$_id.type', 'sell'] }, '$totalAmount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const branchNameMap = await getBranchNameMap(stats.map((item) => item._id));
    res.json({
      success: true,
      data: stats.map((item) => ({
        branchCode: item._id,
        branchName: branchNameMap.get(item._id) || item._id,
        count: item.count,
        totalAmount: item.totalAmount,
        buyCount: item.buyCount,
        buyAmount: item.buyAmount,
        sellCount: item.sellCount,
        sellAmount: item.sellAmount,
      })),
    });
  } catch (error) {
    console.error('Transactions Report Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/stock', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const branchQuery = await applyBranchFilters(req.adminUser, req.query, {}, 'branchCode');
    const txDateMatch = buildDateMatch(req.query, 'date');

    // Use BranchProduct as the source of truth for which branches/products exist
    const branchProducts = await BranchProduct.find(branchQuery).sort({ branchCode: 1, productId: 1 }).lean();
    const branchCodes = [...new Set(branchProducts.map((item) => item.branchCode).filter(Boolean))];
    const productIds = [...new Set(branchProducts.map((item) => item.productId).filter(Boolean))];

    const [products, txStats, branchNameMap] = await Promise.all([
      productIds.length ? Product.find({ productId: { $in: productIds } }, 'name unit category productId').lean() : [],
      branchCodes.length
        ? Transaction.aggregate([
            {
              $match: {
                branchId: { $in: branchCodes },
                status: { $nin: ['cancelled', 'Cancelled', 'CANCELLED', 'rejected', 'Rejected', 'REJECTED'] },
                ...txDateMatch,
              },
            },
            {
              $group: {
                _id: { branchId: '$branchId', productName: { $toLower: '$productName' } },
                buyQty: { $sum: { $cond: [{ $eq: [{ $toLower: '$type' }, 'buy'] }, '$quantity', 0] } },
                sellQty: { $sum: { $cond: [{ $eq: [{ $toLower: '$type' }, 'sell'] }, '$quantity', 0] } },
                unit: { $first: '$unitType' },
                txCount: { $sum: 1 },
              },
            },
          ])
        : [],
      getBranchNameMap(branchCodes),
    ]);

    const productMap = new Map(products.map((p) => [p.productId, p]));
    // key: "branchCode::productname_lowercase"
    const txMap = new Map(txStats.map((item) => [`${item._id.branchId}::${item._id.productName}`, item]));

    const branchMap = new Map();
    branchProducts.forEach((item) => {
      const product = productMap.get(item.productId);
      const productName = product?.name || item.productId;
      const txKey = `${item.branchCode}::${productName.toLowerCase()}`;
      const tx = txMap.get(txKey) || {};
      const buyQty = tx.buyQty || 0;
      const sellQty = tx.sellQty || 0;
      const stock = buyQty - sellQty;

      if (!branchMap.has(item.branchCode)) {
        branchMap.set(item.branchCode, {
          branchCode: item.branchCode,
          branchName: branchNameMap.get(item.branchCode) || item.branchCode,
          products: [],
          totalBuyQty: 0,
          totalSellQty: 0,
          totalStock: 0,
        });
      }
      const branch = branchMap.get(item.branchCode);
      branch.products.push({
        productName,
        category: product?.category || 'General',
        unit: tx.unit || product?.unit || '-',
        buyQty,
        sellQty,
        stock,
        txCount: tx.txCount || 0,
      });
      branch.totalBuyQty += buyQty;
      branch.totalSellQty += sellQty;
      branch.totalStock += stock;
    });

    res.json({ success: true, data: [...branchMap.values()] });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/members', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const match = await applyBranchFilters(req.adminUser, req.query, buildDateMatch(req.query), 'branchId');
    const stats = await Member.aggregate([
      { $match: match },
      { $group: { _id: '$branchId', count: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]);
    const branchNameMap = await getBranchNameMap(stats.map((item) => item._id));
    res.json({ success: true, data: stats.map((item) => ({ ...item, branchName: branchNameMap.get(item._id) || item._id })) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/field-visitors', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const visitors = await FieldVisitor.find(query, 'fullName name userId branchId status createdAt').sort({ branchId: 1 }).lean();
    const visitorIds = visitors.map((visitor) => visitor._id);
    const [memberCounts, transactionStats, branchNameMap] = await Promise.all([
      Member.aggregate([{ $match: { fieldVisitorId: { $in: visitorIds } } }, { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } }]),
      Transaction.aggregate([
        { $match: { fieldVisitorId: { $in: visitorIds }, ...buildDateMatch(req.query, 'date') } },
        { $group: { _id: '$fieldVisitorId', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]),
      getBranchNameMap([...new Set(visitors.map((visitor) => visitor.branchId))]),
    ]);
    const memberMap = new Map(memberCounts.map((item) => [String(item._id), item.count]));
    const txMap = new Map(transactionStats.map((item) => [String(item._id), item]));
    res.json({
      success: true,
      data: visitors.map((visitor) => ({
        _id: String(visitor._id),
        name: visitor.fullName || visitor.name,
        userId: visitor.userId,
        branchCode: visitor.branchId,
        branchName: branchNameMap.get(visitor.branchId) || visitor.branchId,
        status: visitor.status,
        members: memberMap.get(String(visitor._id)) || 0,
        transactionCount: txMap.get(String(visitor._id))?.count || 0,
        totalAmount: txMap.get(String(visitor._id))?.totalAmount || 0,
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/field-visitor-details', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const query = await applyBranchFilters(
      req.adminUser,
      req.query,
      textMatch(req.query.search, ['fullName', 'name', 'userId', 'phone', 'email', 'nic', 'area']),
      'branchId'
    );
    const visitors = await FieldVisitor.find(query)
      .select('-password -fcmToken -profileImage')
      .sort({ _id: -1 })
      .limit(200)
      .lean();
    const visitorIds = visitors.map((visitor) => visitor._id);
    const txDateMatch = buildDateMatch(req.query, 'date');

    const [centralMemberCounts, leadCounts, txStats, recentTx, branchNameMap, managers] = await Promise.all([
      Member.aggregate([{ $match: { fieldVisitorId: { $in: visitorIds } } }, { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } }]),
      ExtraMember.aggregate([{ $match: { collectedBy: { $in: visitorIds } } }, { $group: { _id: '$collectedBy', count: { $sum: 1 } } }]),
      Transaction.aggregate([
        { $match: { fieldVisitorId: { $in: visitorIds }, ...txDateMatch } },
        {
          $group: {
            _id: '$fieldVisitorId',
            transactionCount: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            buyCount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, 1, 0] } },
            buyAmount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, '$totalAmount', 0] } },
            sellCount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, 1, 0] } },
            sellAmount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, '$totalAmount', 0] } },
          },
        },
      ]),
      Transaction.find({ fieldVisitorId: { $in: visitorIds }, ...txDateMatch })
        .sort({ date: -1, createdAt: -1 })
        .limit(1000)
        .lean(),
      getBranchNameMap([...new Set(visitors.map((visitor) => visitor.branchId))]),
      BranchManager.find({ _id: { $in: visitors.map((visitor) => visitor.managerId).filter(Boolean) } }, 'fullName name userId phone email').lean(),
    ]);

    const memberCountMap = new Map(centralMemberCounts.map((item) => [String(item._id), item.count]));
    const leadCountMap = new Map(leadCounts.map((item) => [String(item._id), item.count]));
    const statsMap = new Map(txStats.map((item) => [String(item._id), item]));
    const managerMap = new Map(managers.map((manager) => [String(manager._id), manager]));
    const memberMap = await getMemberLookup(recentTx);
    const visitorMap = new Map(visitors.map((visitor) => [String(visitor._id), visitor]));
    const txHistoryMap = new Map();
    recentTx.forEach((transaction) => {
      const key = String(transaction.fieldVisitorId);
      const list = txHistoryMap.get(key) || [];
      if (list.length < 30) list.push(summarizeTransaction(transaction, memberMap, visitorMap));
      txHistoryMap.set(key, list);
    });

    res.json({
      success: true,
      data: visitors.map((visitor) => {
        const stats = getTxStats(statsMap, visitor._id);
        const manager = managerMap.get(String(visitor.managerId));
        return {
          _id: String(visitor._id),
          reportType: 'Field Worker Full Details',
          name: visitor.fullName || visitor.name,
          userId: visitor.userId,
          nic: visitor.nic || '-',
          mobile: visitor.phone || '-',
          email: visitor.email || '-',
          gender: visitor.gender || '-',
          dob: formatReportDate(visitor.dob),
          address: visitor.permanentAddress || visitor.postalAddress || '-',
          area: visitor.area || '-',
          branchCode: visitor.branchId,
          branchName: branchNameMap.get(visitor.branchId) || visitor.branchId,
          managerName: manager?.fullName || manager?.name || '-',
          managerPhone: manager?.phone || '-',
          status: visitor.status,
          walletBalance: visitor.walletBalance || 0,
          members: memberCountMap.get(String(visitor._id)) || 0,
          leads: leadCountMap.get(String(visitor._id)) || 0,
          transactionCount: stats.transactionCount,
          totalAmount: stats.totalAmount,
          buyCount: stats.buyCount,
          buyAmount: stats.buyAmount,
          sellCount: stats.sellCount,
          sellAmount: stats.sellAmount,
          registeredAt: formatReportDate(visitor.createdAt),
          bankName: visitor.bankDetails?.bankName || '-',
          bankAccount: visitor.bankDetails?.accountNumber || '-',
          transactionHistory: (txHistoryMap.get(String(visitor._id)) || []).join('\n') || 'No transactions',
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/branch-managers', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const managers = await BranchManager.find(query, 'fullName name userId branchId status createdAt').sort({ branchId: 1 }).lean();
    const branchNameMap = await getBranchNameMap([...new Set(managers.map((manager) => manager.branchId))]);
    res.json({
      success: true,
      data: managers.map((manager) => ({
        _id: String(manager._id),
        name: manager.fullName || manager.name,
        userId: manager.userId,
        branchCode: manager.branchId,
        branchName: branchNameMap.get(manager.branchId) || manager.branchId,
        status: manager.status,
        createdAt: manager.createdAt,
      })),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/manager-details', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const query = await applyBranchFilters(
      req.adminUser,
      req.query,
      textMatch(req.query.search, ['fullName', 'name', 'userId', 'phone', 'email', 'branchName']),
      'branchId'
    );
    const managers = await BranchManager.find(query)
      .select('-password -fcmToken -profileImage')
      .sort({ _id: -1 })
      .limit(100)
      .lean();
    const managerIds = managers.map((manager) => manager._id);
    const branchCodes = [...new Set(managers.map((manager) => manager.branchId).filter(Boolean))];
    const txDateMatch = buildDateMatch(req.query, 'date');
    const [visitors, managerMembers, centralMemberCounts, txStats, recentTx, branchNameMap] = await Promise.all([
      FieldVisitor.find({ managerId: { $in: managerIds } }, 'fullName name userId phone branchId managerId').lean(),
      ManagersMember.find({ addedBy: { $in: managerIds } }, 'name mobile nic memberCode addedBy branchId createdAt').lean(),
      Member.aggregate([{ $match: { branchId: { $in: branchCodes } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      Transaction.aggregate([
        { $match: { branchId: { $in: branchCodes }, ...txDateMatch } },
        {
          $group: {
            _id: '$branchId',
            transactionCount: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            buyCount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, 1, 0] } },
            buyAmount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, '$totalAmount', 0] } },
            sellCount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, 1, 0] } },
            sellAmount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, '$totalAmount', 0] } },
          },
        },
      ]),
      Transaction.find({ branchId: { $in: branchCodes }, ...txDateMatch }).sort({ date: -1, createdAt: -1 }).limit(1200).lean(),
      getBranchNameMap(branchCodes),
    ]);

    const visitorsByManager = new Map();
    visitors.forEach((visitor) => {
      const key = String(visitor.managerId);
      visitorsByManager.set(key, [...(visitorsByManager.get(key) || []), visitor]);
    });
    const managerMembersByManager = new Map();
    managerMembers.forEach((member) => {
      const key = String(member.addedBy);
      managerMembersByManager.set(key, [...(managerMembersByManager.get(key) || []), member]);
    });
    const centralMembersByBranch = new Map(centralMemberCounts.map((item) => [String(item._id), item.count]));
    const statsMap = new Map(txStats.map((item) => [String(item._id), item]));
    const memberMap = await getMemberLookup(recentTx);
    const visitorMap = new Map(visitors.map((visitor) => [String(visitor._id), visitor]));
    const txHistoryByBranch = new Map();
    recentTx.forEach((transaction) => {
      const list = txHistoryByBranch.get(transaction.branchId) || [];
      if (list.length < 40) list.push(summarizeTransaction(transaction, memberMap, visitorMap));
      txHistoryByBranch.set(transaction.branchId, list);
    });

    res.json({
      success: true,
      data: managers.map((manager) => {
        const managerVisitors = visitorsByManager.get(String(manager._id)) || [];
        const addedMembers = managerMembersByManager.get(String(manager._id)) || [];
        const stats = getTxStats(statsMap, manager.branchId);
        return {
          _id: String(manager._id),
          reportType: 'Manager Full Details',
          name: manager.fullName || manager.name,
          userId: manager.userId,
          nic: manager.nic || '-',
          mobile: manager.phone || '-',
          email: manager.email || '-',
          branchCode: manager.branchId,
          branchName: branchNameMap.get(manager.branchId) || manager.branchName || manager.branchId,
          status: manager.status,
          walletBalance: manager.walletBalance || 0,
          fieldWorkers: managerVisitors.length,
          fieldWorkerList: managerVisitors.map((visitor) => `${visitor.fullName || visitor.name} (${visitor.userId || '-'}) ${visitor.phone || ''}`).join('\n') || '-',
          branchMembers: centralMembersByBranch.get(manager.branchId) || 0,
          managerAddedMembers: addedMembers.length,
          managerAddedMemberList: addedMembers.map((member) => `${member.name} | ${member.nic || '-'} | ${member.mobile || '-'} | ${member.memberCode || '-'}`).join('\n') || '-',
          transactionCount: stats.transactionCount,
          totalAmount: stats.totalAmount,
          buyCount: stats.buyCount,
          buyAmount: stats.buyAmount,
          sellCount: stats.sellCount,
          sellAmount: stats.sellAmount,
          createdAt: formatReportDate(manager.createdAt),
          transactionHistory: (txHistoryByBranch.get(manager.branchId) || []).join('\n') || 'No transactions',
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/member-details', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const baseQuery = await applyBranchFilters(
      req.adminUser,
      req.query,
      textMatch(req.query.search, ['name', 'mobile', 'email', 'nic', 'memberCode', 'area']),
      'branchId'
    );
    const MEMBER_FIELDS = 'name mobile email nic memberCode fieldVisitorId branchId area memberType status registrationFeePaid registeredAt walletBalance totalBuyAmount totalSellAmount';
    const members = await Member.find(baseQuery).select(MEMBER_FIELDS).sort({ _id: -1 }).lean();

    const memberIds = members.map((m) => m._id);
    const txDateMatch = buildDateMatch(req.query, 'date');
    const hasBranchFilter = !!(req.query.branchCode || req.query.branchId);
    const [txStats, recentTx, branchNameMap, visitors] = await Promise.all([
      Transaction.aggregate([
        { $match: { memberId: { $in: memberIds }, ...txDateMatch } },
        { $group: {
            _id: '$memberId',
            transactionCount: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
            buyCount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, 1, 0] } },
            buyAmount: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, '$totalAmount', 0] } },
            sellCount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, 1, 0] } },
            sellAmount: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, '$totalAmount', 0] } },
        } },
      ]),
      hasBranchFilter
        ? Transaction.find({ memberId: { $in: memberIds }, ...txDateMatch }).sort({ _id: -1 }).limit(500).lean()
        : Promise.resolve([]),
      getBranchNameMap([...new Set(members.map((m) => m.branchId))]),
      FieldVisitor.find({ _id: { $in: members.map((m) => m.fieldVisitorId).filter(Boolean) } }, 'fullName name userId phone email').lean(),
    ]);

    const statsMap = new Map(txStats.map((item) => [String(item._id), item]));
    const memberMap = new Map(members.map((m) => [String(m._id), m]));
    const visitorMap = new Map(visitors.map((v) => [String(v._id), v]));
    const txHistoryMap = new Map();
    recentTx.forEach((transaction) => {
      const key = String(transaction.memberId);
      const list = txHistoryMap.get(key) || [];
      if (list.length < 20) list.push(summarizeTransaction(transaction, memberMap, visitorMap));
      txHistoryMap.set(key, list);
    });

    res.json({
      success: true,
      data: members.map((member) => {
        const stats = getTxStats(statsMap, member._id);
        const visitor = visitorMap.get(String(member.fieldVisitorId));
        return {
          _id: String(member._id),
          reportType: 'Member Full Details',
          name: member.name,
          memberCode: member.memberCode || '-',
          nic: member.nic || '-',
          mobile: member.mobile || '-',
          email: member.email || '-',
          area: member.area || '-',
          branchCode: member.branchId || '-',
          branchName: branchNameMap.get(member.branchId) || member.branchId || '-',
          memberType: member.memberType || '-',
          status: member.status || '-',
          registrationFeePaid: member.registrationFeePaid ? 'Paid' : 'Not paid',
          registeredAt: formatReportDate(member.registeredAt || member.createdAt),
          fieldWorkerName: visitor?.fullName || visitor?.name || '-',
          fieldWorkerUserId: visitor?.userId || '-',
          fieldWorkerPhone: visitor?.phone || '-',
          walletBalance: member.walletBalance || 0,
          transactionCount: stats.transactionCount,
          totalAmount: stats.totalAmount,
          buyCount: stats.buyCount,
          buyAmount: stats.buyAmount,
          sellCount: stats.sellCount,
          sellAmount: stats.sellAmount,
          transactionHistory: (txHistoryMap.get(String(member._id)) || []).join('\n') || 'No transactions',
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/leads-details', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const baseQuery = await applyBranchFilters(
      req.adminUser,
      req.query,
      textMatch(req.query.search, ['name', 'mobile', 'email', 'nic', 'memberCode', 'area']),
      'branchId'
    );
    const EXTRA_FIELDS = 'name mobile email nic memberCode collectedBy collectedAt branchId area memberType registrationFeePaid walletBalance totalBuyAmount totalSellAmount notes';
    const leads = await ExtraMember.find(baseQuery).select(EXTRA_FIELDS).sort({ _id: -1 }).lean();

    const collectorIds = [...new Set(leads.map((l) => l.collectedBy).filter(Boolean))];
    const [branchNameMap, collectors] = await Promise.all([
      getBranchNameMap([...new Set(leads.map((l) => l.branchId).filter(Boolean))]),
      FieldVisitor.find({ _id: { $in: collectorIds } }, 'fullName name userId phone email').lean(),
    ]);
    const collectorMap = new Map(collectors.map((v) => [String(v._id), v]));

    res.json({
      success: true,
      data: leads.map((lead) => {
        const collector = collectorMap.get(String(lead.collectedBy));
        return {
          _id: String(lead._id),
          reportType: 'Leads Full Details',
          name: lead.name,
          memberCode: lead.memberCode || '-',
          nic: lead.nic || '-',
          mobile: lead.mobile || '-',
          email: lead.email || '-',
          area: lead.area || '-',
          branchCode: lead.branchId || '-',
          branchName: branchNameMap.get(lead.branchId) || lead.branchId || '-',
          memberType: lead.memberType || '-',
          registrationFeePaid: lead.registrationFeePaid ? 'Paid' : 'Not paid',
          collectedAt: formatReportDate(lead.collectedAt || lead.createdAt),
          notes: lead.notes || '-',
          collectedByName: collector?.fullName || collector?.name || '-',
          collectedByUserId: collector?.userId || '-',
          collectedByPhone: collector?.phone || '-',
          walletBalance: lead.walletBalance || 0,
          totalBuyAmount: lead.totalBuyAmount || 0,
          totalSellAmount: lead.totalSellAmount || 0,
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/manager-member-details', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const baseQuery = await applyBranchFilters(
      req.adminUser,
      req.query,
      textMatch(req.query.search, ['name', 'mobile', 'email', 'nic', 'memberCode', 'area']),
      'branchId'
    );
    const MGR_MEMBER_FIELDS = 'name mobile email nic memberCode addedBy branchId area memberType registrationFeePaid totalBuyAmount totalSellAmount createdAt';
    const mgrMembers = await ManagersMember.find(baseQuery).select(MGR_MEMBER_FIELDS).sort({ _id: -1 }).lean();

    const managerIds = [...new Set(mgrMembers.map((m) => m.addedBy).filter(Boolean))];
    const [branchNameMap, managers] = await Promise.all([
      getBranchNameMap([...new Set(mgrMembers.map((m) => m.branchId).filter(Boolean))]),
      BranchManager.find({ _id: { $in: managerIds } }, 'fullName name userId phone email').lean(),
    ]);
    const managerMap = new Map(managers.map((mgr) => [String(mgr._id), mgr]));

    res.json({
      success: true,
      data: mgrMembers.map((member) => {
        const manager = managerMap.get(String(member.addedBy));
        return {
          _id: String(member._id),
          reportType: 'Manager Member Details',
          name: member.name,
          memberCode: member.memberCode || '-',
          nic: member.nic || '-',
          mobile: member.mobile || '-',
          email: member.email || '-',
          area: member.area || '-',
          branchCode: member.branchId || '-',
          branchName: branchNameMap.get(member.branchId) || member.branchId || '-',
          memberType: member.memberType || '-',
          registrationFeePaid: member.registrationFeePaid ? 'Paid' : 'Not paid',
          registeredAt: formatReportDate(member.createdAt),
          addedByName: manager?.fullName || manager?.name || '-',
          addedByUserId: manager?.userId || '-',
          addedByPhone: manager?.phone || '-',
          totalBuyAmount: member.totalBuyAmount || 0,
          totalSellAmount: member.totalSellAmount || 0,
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/reports/hierarchy
// @desc    Manager → FV → member/transaction drill-down data
router.get('/hierarchy', adminOnly, checkPermission('Reports', 'view'), async (req, res) => {
  try {
    const query = await applyBranchFilters(req.adminUser, req.query, {}, 'branchId');
    const managers = await BranchManager.find(query, 'fullName name userId branchId walletBalance phone email status createdAt').sort({ branchId: 1, fullName: 1 }).lean();
    const managerIds = managers.map((m) => m._id);
    const branchCodes = [...new Set(managers.map((m) => m.branchId).filter(Boolean))];

    // Fetch field visitors first so we can filter aggregations by their IDs
    const fieldVisitors = await FieldVisitor.find({ managerId: { $in: managerIds } }, 'fullName name userId branchId managerId walletBalance phone status').lean();
    const fvIds = fieldVisitors.map((fv) => fv._id);

    const [centralMembersByBranch, fvMemberCounts, fvTxStats, branchTxStats, branchNameMap] = await Promise.all([
      Member.aggregate([{ $match: { branchId: { $in: branchCodes } } }, { $group: { _id: '$branchId', count: { $sum: 1 } } }]),
      fvIds.length
        ? Member.aggregate([{ $match: { fieldVisitorId: { $in: fvIds } } }, { $group: { _id: '$fieldVisitorId', count: { $sum: 1 } } }])
        : Promise.resolve([]),
      fvIds.length
        ? Transaction.aggregate([
            { $match: { fieldVisitorId: { $in: fvIds } } },
            { $group: { _id: '$fieldVisitorId', total: { $sum: '$totalAmount' }, count: { $sum: 1 }, buy: { $sum: { $cond: [{ $in: ['$type', ['buy', 'Buy']] }, '$totalAmount', 0] } }, sell: { $sum: { $cond: [{ $in: ['$type', ['sell', 'Sell']] }, '$totalAmount', 0] } } } },
          ])
        : Promise.resolve([]),
      branchCodes.length
        ? Transaction.aggregate([
            { $match: { branchId: { $in: branchCodes } } },
            { $group: { _id: '$branchId', total: { $sum: '$totalAmount' }, buy: { $sum: { $cond: [{ $in: ['$type', ['buy', 'Buy']] }, '$totalAmount', 0] } }, sell: { $sum: { $cond: [{ $in: ['$type', ['sell', 'Sell']] }, '$totalAmount', 0] } } } },
          ])
        : Promise.resolve([]),
      getBranchNameMap(branchCodes),
    ]);

    const fvsByManager = new Map();
    fieldVisitors.forEach((fv) => {
      const key = String(fv.managerId);
      fvsByManager.set(key, [...(fvsByManager.get(key) || []), fv]);
    });
    const centralByBranch = new Map(centralMembersByBranch.map((item) => [item._id, item.count]));
    const fvMemberMap = new Map(fvMemberCounts.map((item) => [String(item._id), item.count]));
    const fvTxMap = new Map(fvTxStats.map((item) => [String(item._id), item]));
    const branchTxMap = new Map(branchTxStats.map((item) => [String(item._id), item]));

    res.json({
      success: true,
      data: managers.map((manager) => {
        const fvs = fvsByManager.get(String(manager._id)) || [];
        const bTx = branchTxMap.get(manager.branchId) || {};
        return {
          _id: String(manager._id),
          name: manager.fullName || manager.name,
          userId: manager.userId,
          phone: manager.phone || '-',
          email: manager.email || '-',
          branchCode: manager.branchId,
          branchName: branchNameMap.get(manager.branchId) || manager.branchId,
          walletBalance: Number(manager.walletBalance || 0),
          status: manager.status,
          branchMemberCount: centralByBranch.get(manager.branchId) || 0,
          branchTotalAmount: bTx.total || 0,
          branchBuyAmount: bTx.buy || 0,
          branchSellAmount: bTx.sell || 0,
          createdAt: formatReportDate(manager.createdAt),
          fieldVisitors: fvs.map((fv) => {
            const tx = fvTxMap.get(String(fv._id)) || {};
            return {
              _id: String(fv._id),
              name: fv.fullName || fv.name,
              userId: fv.userId,
              phone: fv.phone || '-',
              walletBalance: Number(fv.walletBalance || 0),
              status: fv.status,
              memberCount: fvMemberMap.get(String(fv._id)) || 0,
              totalAmount: tx.total || 0,
              buyAmount: tx.buy || 0,
              sellAmount: tx.sell || 0,
              transactionCount: tx.count || 0,
            };
          }),
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/reports/export/csv
// @desc    Export data to CSV
router.get('/export/csv', adminOnly, checkPermission('Reports', 'export'), async (req, res) => {
  try {
    const type = String(req.query.type || 'transactions');

    if (type === 'branches') {
      const branchQuery = await applyBranchFilters(req.adminUser, req.query, {}, 'branchCode');
      const branches = await Branch.find(branchQuery).sort({ branchName: 1 }).lean();
      const lines = [
        ['Branch Name', 'Branch Code', 'Branch ID', 'Status', 'Created At'].join(','),
        ...branches.map((branch) =>
          [
            escapeCsv(branch.branchName),
            escapeCsv(branch.branchCode),
            escapeCsv(branch.branchId),
            escapeCsv(branch.status),
            escapeCsv(branch.createdAt),
          ].join(',')
        ),
      ];

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=branches-report.csv');
      return res.send(lines.join('\n'));
    }

    const match = await buildTransactionMatch(req.adminUser, req.query);
    const transactions = await Transaction.find(match).sort({ date: -1, createdAt: -1 }).lean();
    const lines = [
      ['Bill Number', 'Type', 'Product', 'Quantity', 'Unit Price', 'Total Amount', 'Branch Code', 'Status', 'Date'].join(','),
      ...transactions.map((transaction) =>
        [
          escapeCsv(transaction.billNumber),
          escapeCsv(transaction.type),
          escapeCsv(transaction.productName),
          escapeCsv(transaction.quantity),
          escapeCsv(transaction.unitPrice),
          escapeCsv(transaction.totalAmount),
          escapeCsv(transaction.branchId),
          escapeCsv(transaction.status),
          escapeCsv(transaction.date || transaction.createdAt),
        ].join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions-report.csv');
    res.send(lines.join('\n'));
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

router.get('/export/excel', adminOnly, checkPermission('Reports', 'export'), async (req, res) => {
  req.query.type = req.query.type || 'transactions';
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', `attachment; filename=${req.query.type}-report.xls`);
  const match = await buildTransactionMatch(req.adminUser, req.query);
  const transactions = await Transaction.find(match).sort({ date: -1, createdAt: -1 }).lean();
  const rows = [
    '<table><tr><th>Bill Number</th><th>Type</th><th>Product</th><th>Total Amount</th><th>Branch</th><th>Status</th><th>Date</th></tr>',
    ...transactions.map((transaction) => `<tr><td>${escapeCsv(transaction.billNumber)}</td><td>${escapeCsv(transaction.type)}</td><td>${escapeCsv(transaction.productName)}</td><td>${escapeCsv(transaction.totalAmount)}</td><td>${escapeCsv(transaction.branchId)}</td><td>${escapeCsv(transaction.status)}</td><td>${escapeCsv(transaction.date || transaction.createdAt)}</td></tr>`),
    '</table>',
  ];
  res.send(rows.join(''));
});

router.get('/export/pdf', adminOnly, checkPermission('Reports', 'export'), async (req, res) => {
  const match = await buildTransactionMatch(req.adminUser, req.query);
  const transactions = await Transaction.find(match).sort({ date: -1, createdAt: -1 }).limit(500).lean();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename=transactions-report.html');
  res.send(buildTransactionsReportHtml(transactions));
});

module.exports = router;
