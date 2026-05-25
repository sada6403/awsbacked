const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'General' },
    defaultBuyPrice: { type: Number, required: true, default: 0 },
    defaultSellPrice: { type: Number, required: true, default: 0 },
    unit: { type: String, enum: ['Kg', 'g', 'number', 'packets'], required: true },
    productId: { type: String, unique: true }, // e.g. prod-001
    imageUrl: { type: String }, // e.g. assets/images/alovera.webp
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

ProductSchema.index({ status: 1, category: 1 });
ProductSchema.index({ name: 'text', category: 'text', productId: 'text' });

module.exports = mongoose.model('Product', ProductSchema);
