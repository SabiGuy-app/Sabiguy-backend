const mongoose = require('mongoose');

const productDeliveryQuoteSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'Buyer', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'sellerModel' },
  sellerModel: { type: String, enum: ['Provider', 'Business'], required: true },
  pickup: {
    address: { type: String, default: null },
    coordinates: { type: [Number], required: true },
  },
  dropoff: {
    address: { type: String, default: null },
    coordinates: { type: [Number], required: true },
  },
  modeOfDelivery: { type: String, enum: ['Bike', 'Car'], required: true },
  distanceKm: { type: Number, required: true },
  durationMinutes: { type: Number, required: true },
  isEstimate: { type: Boolean, default: false },
  deliveryFee: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('ProductDeliveryQuote', productDeliveryQuoteSchema);
