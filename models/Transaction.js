const mongoose = require ('mongoose');

const transactionSchema = new mongoose.Schema({
  // Reference (unique identifier)
  reference: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Transaction type
  type: {
    type: String,
    enum: [
      // Payment related
      'payment',              // User pays for booking
      'payout',              // Platform pays provider
      'refund',              // User gets refund
      
      // Wallet related
      'escrow_hold',         // Money held in escrow
      'escrow_release',      // Money released from escrow
      'withdrawal',          // Provider withdraws to bank
      'credit',              // Money added to wallet
      'debit',               // Money removed from wallet
      
      // Platform related
      'platform_fee',        // Platform fee collection
      'bonus',               // Promotional bonus
      'commission',          // Any other commissions
      'tip'                  // Tips to providers
    ],
    required: true
  },
  
  // Parties involved
  from: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'from.userModel'
    },
    userModel: {
      type: String,
      enum: ['Buyer', 'Provider', 'Platform']
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet'
    }
  },
  
  to: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'to.userModel'
    },
    userModel: {
      type: String,
      enum: ['Buyer', 'Provider', 'Platform']
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet'
    }
  },
  
  // Amount
  amount: {
    type: Number,
    required: true
  },
  
  // Breakdown (for payments)
  breakdown: {
    agreedPrice: Number,      // Amount for provider
    serviceFee: Number,       // Platform fee
    totalAmount: Number       // Total paid by user
  },
  
  // Related entities
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  
  // Payment gateway details (if external)
  gateway: {
    name: {
      type: String,
      enum: ['paystack', 'internal', 'bank_transfer']
    },
reference: {
    type: String,
    unique: true
  },
      response: mongoose.Schema.Types.Mixed
  },
  
  // Wallet balance snapshots
  balances: {
    before: {
      available: Number,
      pending: Number,
      total: Number
    },
    after: {
      available: Number,
      pending: Number,
      total: Number
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'reversed'],
    default: 'pending'
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
  
  // Bank details (for withdrawals)
  bankDetails: {
    accountNumber: String,
    accountName: String,
    bankCode: String,
    bankName: String
  },
  
  // Timestamps
  completedAt: Date,
  failedAt: Date,
  reversedAt: Date,
  
  // Error info
  error: {
    code: String,
    message: String
  }
  
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ 'from.userId': 1, createdAt: -1 });
transactionSchema.index({ 'to.userId': 1, createdAt: -1 });
transactionSchema.index({ bookingId: 1 });
transactionSchema.index({ type: 1, status: 1 });
// transactionSchema.index({ reference: 1 }, { unique: true });

// Methods
transactionSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

transactionSchema.methods.markFailed = function(errorMessage) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.error = {
    message: errorMessage
  };
  return this.save();
};

module.exports = mongoose.model('Transaction', transactionSchema);

