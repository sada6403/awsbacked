const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    defaultPrice: { type: Number, required: true },
    unit: { type: String, enum: ['Kg', 'g', 'number', 'packets'], required: true },
    productId: { type: String, unique: true } // e.g. prod-001
});

module.exports = mongoose.model('Product', ProductSchema);
