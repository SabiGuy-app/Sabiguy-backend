const mongoose = require ('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  
  type: {
    type: String,
    enum: [
      'credit',           // Money added
      'debit',            // Money removed
      'escrow_hold',      // Money held in escrow
      'escrow_release',   // Money released from escrow
      'withdrawal',       // Provider withdraws
      'refund',           // User gets refund
      'platform_fee',     // Platform fee collection
      'bonus',             // Promotional bonus
      'tip'
    ],
    required: true
  },
  
  amount: {
    type: Number,
    required: true
  },
  
  // Balance snapshots
  balanceBefore: {
    available: Number,
    pending: Number,
    total: Number
  },
  balanceAfter: {
    available: Number,
    pending: Number,
    total: Number
  },
  
  // Reference
  reference: {
    type: String,
    unique: true,
    required: true
  },
  
  // Related entities
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  
  // Description
  description: {
    type: String,
    required: true
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed'
  }
}, {
  timestamps: true
});

walletTransactionSchema.index({ walletId: 1, createdAt: -1 });
walletTransactionSchema.index({ reference: 1 });
walletTransactionSchema.index({ bookingId: 1 });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
