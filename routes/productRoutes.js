const express = require('express');
const router = express.Router();
const { getProducts, createProduct, updateBranchPrice } = require('../controllers/productController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
    .get(protect, getProducts) // Protected to get branchId context
    .post(createProduct);

router.post('/branch-price', protect, authorize('manager'), updateBranchPrice);

module.exports = router;
