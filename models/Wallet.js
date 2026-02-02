const mongoose = require ('mongoose');

const walletSchema = new mongoose.Schema ({
    ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'ownerModel'
    },
    ownerModel: {
    type: String,
    required: true,
    enum: ['Buyer', 'Provider', 'Platform']
    },
    balance: {
    available: {
      type: Number,
      default: 0,
      min: 0
    },
    pending: {
      type: Number,
      default: 0,
      min: 0
    },
    total: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Lifetime stats
  totalEarnings: {
    type: Number,
    default: 0
  },
  totalWithdrawals: {
    type: Number,
    default: 0
  },
  totalRefunds: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'frozen'],
    default: 'active'
  },
  
  // Currency
  currency: {
    type: String,
    default: 'NGN'
  },
  
  // Last transaction
  lastTransactionAt: Date
}, {
  timestamps: true
});

// Indexes
walletSchema.index({ ownerId: 1, ownerModel: 1 }, { unique: true });

// Methods
walletSchema.methods.credit = async function(amount, type = 'earning') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Invalid amount for credit');
  }
  this.balance.available += amount;
  this.balance.total += amount;
  
  if (type === 'earning') {
    this.totalEarnings += amount;
  }
  
  this.lastTransactionAt = new Date();
  await this.save();
};

walletSchema.methods.debit = async function(amount) {

  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Invalid amount for debit');
  }
  if (this.balance.available < amount) {
    throw new Error('Insufficient balance');
  }
  
  this.balance.available -= amount;
  this.balance.total -= amount;
  this.totalWithdrawals += amount;
  this.lastTransactionAt = new Date();
  
  await this.save();
};

walletSchema.methods.addPending = async function(amount) {
  this.balance.pending += amount;
  this.balance.total += amount;
  this.lastTransactionAt = new Date();
  
  await this.save();
};

walletSchema.methods.movePendingToAvailable = async function(amount) {
  // if (this.balance.pending < amount) {
  //   throw new Error('Insufficient pending balance');
  // }
  
  this.balance.pending -= amount;
  this.balance.available += amount;
  this.totalEarnings += amount;
  this.lastTransactionAt = new Date();
  
  await this.save();
};

walletSchema.methods.removePending = async function(amount) {
  if (this.balance.pending < amount) {
    throw new Error('Insufficient pending balance');
  }
  
  this.balance.pending -= amount;
  this.balance.total -= amount;
  this.lastTransactionAt = new Date();
  
  await this.save();
};

module.exports = mongoose.model('Wallet', walletSchema);