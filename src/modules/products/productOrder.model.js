const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  productImage: { type: String, default: null },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const productOrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true, index: true },
  seller: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'sellerModel', index: true },
  sellerModel: { type: String, enum: ['Provider', 'Business'], required: true },
  sellerType: { type: String, enum: ['provider', 'business'], required: true },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
  fulfillmentType: { type: String, enum: ['delivery', 'pickup'], required: true },
  deliveryAddress: {
    recipientName: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    instructions: { type: String, trim: true, default: null },
  },
  pickupNote: { type: String, trim: true, default: null },
  trackingNumber: { type: String, trim: true, default: null },
  sellerNote: { type: String, trim: true, maxlength: 1000, default: null },
  subtotal: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN', uppercase: true },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'processing', 'shipped', 'ready_for_pickup', 'delivered'],
    default: 'pending_payment',
    index: true,
  },
  paymentReference: { type: String, required: true, unique: true },
  paidAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  escrowReleasedAt: { type: Date, default: null },
}, { timestamps: true });

productOrderSchema.index({ buyer: 1, createdAt: -1 });
productOrderSchema.index({ seller: 1, sellerModel: 1, createdAt: -1 });

module.exports = mongoose.model('ProductOrder', productOrderSchema);
