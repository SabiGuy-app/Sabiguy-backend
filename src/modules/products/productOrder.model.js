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
  deliveryQuote: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductDeliveryQuote', default: null },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
  fulfillmentType: { type: String, enum: ['delivery', 'pickup'], required: true },
  deliveryAddress: {
    recipientName: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },
    address: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    state: { type: String, trim: true, default: null },
    instructions: { type: String, trim: true, default: null },
    coordinates: { type: [Number], default: undefined },
  },
  pickupNote: { type: String, trim: true, default: null },
  trackingNumber: { type: String, trim: true, default: null },
  sellerNote: { type: String, trim: true, maxlength: 1000, default: null },
  subtotal: { type: Number, required: true, min: 0 },
  deliveryFee: { type: Number, min: 0, default: 0 },
  productCommission: { type: Number, min: 0, default: 0 },
  buyerPlatformFee: { type: Number, min: 0, default: 0 },
  platformFee: { type: Number, min: 0, default: 0 },
  sellerPayout: { type: Number, min: 0, default: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'NGN', uppercase: true },
  status: {
    type: String,
    enum: ['pending_payment', 'paid', 'processing', 'shipped', 'ready_for_pickup', 'delivered', 'disputed', 'completed'],
    default: 'pending_payment',
    index: true,
  },
  paymentReference: { type: String, required: true, unique: true },
  paymentMethod: { type: String, enum: ['paystack', 'wallet'], default: 'paystack' },
  paidAt: { type: Date, default: null },
  sellerEmailNotifiedAt: { type: Date, default: null },
  sellerPushNotifiedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  buyerConfirmedAt: { type: Date, default: null },
  escrowReleasedAt: { type: Date, default: null },
  disputeRaisedAt: { type: Date, default: null },
  disputeRaisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', default: null },
  disputeReason: { type: String, trim: true, maxlength: 2000, default: null },
  disputeAdminEmailSentAt: { type: Date, default: null },
}, { timestamps: true });

productOrderSchema.index({ buyer: 1, createdAt: -1 });
productOrderSchema.index({ seller: 1, sellerModel: 1, createdAt: -1 });

module.exports = mongoose.model('ProductOrder', productOrderSchema);
