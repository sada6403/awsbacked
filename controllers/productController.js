const Product = require('../models/Product');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
    const products = await Product.find({});
    res.json(products);
};

// @desc    Create product (Seed helper)
// @route   POST /api/products
const createProduct = async (req, res) => {
    const { name, defaultPrice, unit, productId } = req.body;
    const product = await Product.create({ name, defaultPrice, unit, productId });
    res.status(201).json(product);
};

module.exports = { getProducts, createProduct };
