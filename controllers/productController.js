const Product = require('../models/Product');
const BranchProduct = require('../models/BranchProduct');
const cacheService = require('../services/cacheService');

// @desc    Get all products (with branch specific prices)
// @route   GET /api/products
// @access  Private (Protected)
const getProducts = async (req, res) => {
    try {
        const branchId = req.user?.branchId || 'default-branch'; // from auth middleware

        const cacheKey = `products_${branchId}`;
        const cached = cacheService.get(cacheKey);
        if (cached) {
            console.log(`[getProducts] Serving from Cache: ${cacheKey}`);
            return res.json(cached);
        }

        // 1. Get all base products
        const products = await Product.find({}).lean();

        // 2. If branchId exists, get overrides
        let branchPrices = [];
        if (branchId) {
            branchPrices = await BranchProduct.find({ branchId }).lean();
        }

        // 3. Merge prices
        const mergedProducts = products.map(p => {
            const override = branchPrices.find(bp => bp.productId === p.productId);
            return {
                ...p,
                buyPrice: override ? (override.buyPrice ?? override.price ?? p.defaultBuyPrice) : p.defaultBuyPrice,
                sellPrice: override ? (override.sellPrice ?? override.price ?? p.defaultSellPrice) : p.defaultSellPrice,
                defaultBuyPrice: p.defaultBuyPrice,
                defaultSellPrice: p.defaultSellPrice,
                isBranchPrice: true, // Force to true so frontend displays it in buy_sell screen
                isActuallyOverridden: !!override // Keep real state just in case
            };
        });

        cacheService.set(cacheKey, mergedProducts, 3600); // Cache for 1 hour
        res.json(mergedProducts);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Update branch specific product price
// @route   POST /api/products/branch-price
// @access  Private (Manager only)
const updateBranchPrice = async (req, res) => {
    try {
        const { productId, buyPrice, sellPrice } = req.body;
        const branchId = req.user.branchId;
        const userId = req.user._id;

        if (!productId) {
            return res.status(400).json({ success: false, message: 'ProductId is required' });
        }

        // Upsert the branch product price
        const updated = await BranchProduct.findOneAndUpdate(
            { branchId, productId },
            {
                branchId,
                productId,
                buyPrice: buyPrice !== undefined ? Number(buyPrice) : 0,
                sellPrice: sellPrice !== undefined ? Number(sellPrice) : 0,
                updatedBy: userId
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        // Invalidate product cache for this branch
        cacheService.del(`products_${branchId}`);

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('Error updating branch price:', error);
        res.status(500).json({ success: false, message: 'Failed to update price', error: error.message });
    }
};

// @desc    Create product (Seed helper)
// @route   POST /api/products
const createProduct = async (req, res) => {
    const { name, defaultBuyPrice, defaultSellPrice, unit, productId } = req.body;
    const product = await Product.create({ name, defaultBuyPrice, defaultSellPrice, unit, productId });
    res.status(201).json(product);
};

module.exports = { getProducts, createProduct, updateBranchPrice };
