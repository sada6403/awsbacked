const express = require('express');
const router = express.Router();
const adminOnly = require('../../middleware/adminOnlyMiddleware');
const checkPermission = require('../../middleware/permissionMiddleware');
const auditLog = require('../../middleware/auditLogMiddleware');
const Product = require('../../models/Product');
const Branch = require('../../models/Branch');
const BranchProduct = require('../../models/BranchProduct');
const { getAccessibleBranchIds, canAccessBranch } = require('../../utils/adminAccess');
const { resolveRequestedBranchCodes, validateBranchCode } = require('../../utils/adminBranchFilters');
const { buildOfficialBranchQuery } = require('../../utils/branchMaster');

function buildBranchConfigMap(configs) {
  const map = new Map();
  for (const config of configs) {
    map.set(`${config.productId}:${config.branchCode}`, config);
  }
  return map;
}

function normalizeProductPayload(payload = {}) {
  return {
    name: payload.name,
    category: payload.category || 'General',
    productId: payload.productId || undefined,
    defaultBuyPrice: Number(payload.defaultBuyPrice || 0),
    defaultSellPrice: Number(payload.defaultSellPrice || 0),
    unit: payload.unit,
    imageUrl: payload.imageUrl || undefined,
    status: payload.status || 'active',
  };
}

// @route   GET /api/admin/products
// @desc    Get all products
router.get('/', adminOnly, checkPermission('Products', 'view'), async (req, res) => {
  try {
    const { search, status } = req.query;
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const productQuery = {};

    if (status) {
      productQuery.status = String(status).trim().toLowerCase();
    }
    if (search) {
      const pattern = new RegExp(String(search).trim(), 'i');
      productQuery.$or = [{ name: pattern }, { category: pattern }, { productId: pattern }, { unit: pattern }];
    }

    const products = await Product.find(productQuery).sort({ createdAt: -1 }).lean();
    const configQuery = branchCodes.length > 0 ? { branchCode: { $in: branchCodes } } : {};
    const branchConfigs = await BranchProduct.find(configQuery).lean();
    const branchConfigMap = buildBranchConfigMap(branchConfigs);
    const configsByProduct = branchConfigs.reduce((acc, item) => {
      if (!acc[item.productId]) acc[item.productId] = [];
      acc[item.productId].push(item);
      return acc;
    }, {});

    res.json({
      success: true,
      data: products.map((product) => {
        const activeBranchCode = branchCodes[0] || null;
        const oid = String(product._id);
        const pid = product.productId;
        const activeConfig = activeBranchCode
          ? (branchConfigMap.get(`${oid}:${activeBranchCode}`) || branchConfigMap.get(`${pid}:${activeBranchCode}`))
          : (configsByProduct[oid]?.[0] || configsByProduct[pid]?.[0]);
        return {
          ...product,
          branchPrice: activeConfig?.sellPrice ?? product.defaultSellPrice,
          branchBuyPrice: activeConfig?.buyPrice ?? product.defaultBuyPrice,
          branchStock: activeConfig?.stock ?? 0,
          branchConfigs: configsByProduct[oid] || configsByProduct[pid] || [],
        };
      }),
    });
  } catch (error) {
    console.error('Fetch Products Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/products/branch-price-board
// @desc    All product × branch price configs in one flat list
router.get('/branch-price-board', adminOnly, checkPermission('Products', 'view'), async (req, res) => {
  try {
    const { branchCodes } = await resolveRequestedBranchCodes(req.adminUser, req.query);
    const configQuery = branchCodes.length > 0 ? { branchCode: { $in: branchCodes } } : {};
    const [configs, products, branches] = await Promise.all([
      BranchProduct.find(configQuery).sort({ branchCode: 1, productId: 1 }).lean(),
      Product.find({}, 'name category unit').lean(),
      Branch.find({}, 'branchCode branchName').lean(),
    ]);
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const branchMap = new Map(branches.map((b) => [b.branchCode, b.branchName]));
    res.json({
      success: true,
      data: configs.map((c) => {
        const product = productMap.get(c.productId);
        return {
          branchCode: c.branchCode,
          branchName: branchMap.get(c.branchCode) || c.branchCode,
          productId: c.productId,
          productName: product?.name || c.productId,
          category: product?.category || '-',
          unit: product?.unit || '-',
          buyPrice: c.buyPrice,
          sellPrice: c.sellPrice,
          stock: c.stock,
          updatedAt: c.updatedAt || null,
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/products/:id
// @desc    Get single product
router.get('/:id', adminOnly, checkPermission('Products', 'view'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const allowedBranchCodes = getAccessibleBranchIds(req.adminUser);
    const configQuery =
      req.adminUser.role === 'SuperAdmin' || allowedBranchCodes.length === 0
        ? { productId: String(product._id) }
        : { productId: String(product._id), branchCode: { $in: allowedBranchCodes } };
    const branchConfigs = await BranchProduct.find(configQuery).sort({ branchCode: 1 }).lean();
    res.json({ success: true, data: { ...product, branchConfigs } });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/products
// @desc    Create a product
router.post('/', adminOnly, checkPermission('Products', 'create'), auditLog('Products', 'CREATE'), async (req, res) => {
  try {
    const newProduct = new Product(normalizeProductPayload(req.body));
    const savedProduct = await newProduct.save();
    res.status(201).json({ success: true, data: savedProduct });
  } catch (error) {
    console.error('Create Product Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Product code already exists' });
    }
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Update a product
router.put('/:id', adminOnly, checkPermission('Products', 'edit'), auditLog('Products', 'UPDATE'), async (req, res) => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, normalizeProductPayload(req.body), {
      new: true,
      runValidators: true,
    });
    if (!updatedProduct) return res.status(404).json({ message: 'Product not found' });
    res.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('Update Product Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/products/:id/assign-all-branches
// @desc    Assign a product to all available branches
router.post('/:id/assign-all-branches', adminOnly, checkPermission('Products', 'edit'), auditLog('Products', 'ASSIGN_ALL_BRANCHES'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const allowedBranchCodes = getAccessibleBranchIds(req.adminUser);
    const branchQuery =
      req.adminUser.role === 'SuperAdmin' || allowedBranchCodes.length === 0
        ? {}
        : { branchCode: { $in: allowedBranchCodes } };
    const branches = await Branch.find(
      buildOfficialBranchQuery(branchQuery),
      'branchCode branchId'
    ).lean();

    for (const branch of branches) {
      await BranchProduct.updateOne(
        { branchCode: branch.branchCode, productId: String(product._id) },
        {
          $setOnInsert: {
            branchId: branch.branchId || branch.branchCode,
            branchCode: branch.branchCode,
            productId: String(product._id),
            productRef: product._id,
            buyPrice: product.defaultBuyPrice,
            sellPrice: product.defaultSellPrice,
            stock: 0,
            updatedBy: req.adminUser._id,
            updatedByRole: req.adminUser.role,
            changeHistory: [],
          },
        },
        { upsert: true }
      );
    }

    res.json({ success: true, message: `Assigned product to ${branches.length} branches` });
  } catch (error) {
    console.error('Assign Product Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   GET /api/admin/products/:id/branch-configs
// @desc    Get branch-wise configs for a product
router.get('/:id/branch-configs', adminOnly, checkPermission('Products', 'view'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const allowedBranchCodes = getAccessibleBranchIds(req.adminUser);
    const branchQuery =
      req.adminUser.role === 'SuperAdmin' || allowedBranchCodes.length === 0
        ? {}
        : { branchCode: { $in: allowedBranchCodes } };
    const [branches, configs] = await Promise.all([
      Branch.find(buildOfficialBranchQuery(branchQuery), 'branchName branchCode branchId status').sort({ branchName: 1 }).lean(),
      BranchProduct.find({ productId: String(product._id), ...(branchQuery.branchCode ? { branchCode: branchQuery.branchCode } : {}) })
        .sort({ branchCode: 1 })
        .lean(),
    ]);

    const configMap = new Map(configs.map((config) => [config.branchCode, config]));
    res.json({
      success: true,
      data: branches.map((branch) => {
        const config = configMap.get(branch.branchCode);
        return {
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          branchId: branch.branchId,
          status: branch.status,
          buyPrice: config?.buyPrice ?? product.defaultBuyPrice,
          sellPrice: config?.sellPrice ?? product.defaultSellPrice,
          stock: config?.stock ?? 0,
          updatedAt: config?.updatedAt || null,
          changeHistory: config?.changeHistory || [],
        };
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   PUT /api/admin/products/:id/branch-configs
// @desc    Upsert branch-wise price/stock for a product
router.put('/:id/branch-configs', adminOnly, checkPermission('Products', 'edit'), auditLog('Products', 'BRANCH_CONFIG_UPDATE'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const branch = await validateBranchCode(req.body.branchCode);
    if (!branch) {
      return res.status(400).json({ message: 'Invalid Branch Code' });
    }
    if (!canAccessBranch(req.adminUser, branch.branchCode)) {
      return res.status(403).json({ message: 'You cannot manage this branch price/stock' });
    }

    const buyPrice = Number(req.body.buyPrice ?? product.defaultBuyPrice);
    const sellPrice = Number(req.body.sellPrice ?? product.defaultSellPrice);
    const stock = Number(req.body.stock ?? 0);
    if (buyPrice < 0 || sellPrice < 0 || stock < 0) {
      return res.status(400).json({ message: 'Price and stock must be zero or greater' });
    }

    const existingConfig = await BranchProduct.findOne({ branchCode: branch.branchCode, productId: String(product._id) });
    const nextHistoryEntry = {
      buyPrice,
      sellPrice,
      stock,
      updatedBy: req.adminUser._id,
      updatedByRole: req.adminUser.role,
      updatedAt: new Date(),
    };

    const updatedConfig = await BranchProduct.findOneAndUpdate(
      { branchCode: branch.branchCode, productId: String(product._id) },
      {
        $set: {
          branchId: branch.branchId || branch.branchCode,
          branchCode: branch.branchCode,
          productId: String(product._id),
          productRef: product._id,
          buyPrice,
          sellPrice,
          stock,
          updatedBy: req.adminUser._id,
          updatedByRole: req.adminUser.role,
        },
        $push: { changeHistory: nextHistoryEntry },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: {
        ...updatedConfig.toObject(),
        previous: existingConfig
          ? { buyPrice: existingConfig.buyPrice, sellPrice: existingConfig.sellPrice, stock: existingConfig.stock }
          : null,
      },
    });
  } catch (error) {
    console.error('Update Product Branch Config Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete a product
router.delete('/:id', adminOnly, checkPermission('Products', 'delete'), auditLog('Products', 'DELETE'), async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) return res.status(404).json({ message: 'Product not found' });
    await BranchProduct.deleteMany({ productId: String(req.params.id) });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete Product Error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/products/:id/activate
// @desc    Activate a product
router.post('/:id/activate', adminOnly, checkPermission('Products', 'edit'), auditLog('Products', 'ACTIVATE'), async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

// @route   POST /api/admin/products/:id/deactivate
// @desc    Deactivate a product
router.post('/:id/deactivate', adminOnly, checkPermission('Products', 'edit'), auditLog('Products', 'DEACTIVATE'), async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ success: true, data: product });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || 'Server Error' });
  }
});

module.exports = router;
