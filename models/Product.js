const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    defaultBuyPrice: { type: Number, required: true, default: 0 },
    defaultSellPrice: { type: Number, required: true, default: 0 },
    unit: { type: String, enum: ['Kg', 'g', 'number', 'packets'], required: true },
    productId: { type: String, unique: true }, // e.g. prod-001
    imageUrl: { type: String } // e.g. assets/images/alovera.webp
});

module.exports = mongoose.model('Product', ProductSchema);
