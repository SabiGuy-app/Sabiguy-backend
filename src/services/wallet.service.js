const Wallet = require("../../models/Wallet");
const Transaction = require("../../models/Transaction");
const mongoose = require("mongoose");

class WalletService {
  constructor() {
    // Platform "account" for bookkeeping only
    this.PLATFORM_WALLET_ID = "000000000000000000000001";
  }

  async getPlatformWallet() {
    const platformId = new mongoose.Types.ObjectId(this.PLATFORM_WALLET_ID);

    let wallet = await Wallet.findOne({
      ownerId: platformId,
      ownerModel: "Platform",
    });

    if (!wallet) {
      wallet = await Wallet.create({
        ownerId: platformId,
        ownerModel: "Platform",
        balance: { available: 0, pending: 0, total: 0 },
        metadata: {
          note: "Virtual wallet for platform accounting",
          isVirtual: true,
        },
      });
    }

    return wallet;
  }

  async recordPlatformFee(amount, bookingId) {
    const platformWallet = await this.getPlatformWallet();

    // Record balance before
    const balanceBefore = {
      available: platformWallet.balance.available,
      pending: platformWallet.balance.pending,
      total: platformWallet.balance.total,
    };

    await platformWallet.credit(amount, "fee");

    const balanceAfter = {
      available: platformWallet.balance.available,
      pending: platformWallet.balance.pending,
      total: platformWallet.balance.total,
    };

    await Transaction.create({
      reference: this.generateReference("FEE"),
      type: "platform_fee",
      to: {
        userId: new mongoose.Types.ObjectId(this.PLATFORM_WALLET_ID),
        userModel: "Platform",
        walletId: platformWallet._id,
      },
      amount,
      bookingId,
      balances: {
        before: balanceBefore,
        after: balanceAfter,
      },
      description: `Platform fee (10%) collected for booking #${bookingId}`,
      status: "completed",
      completedAt: new Date(),
    });

    return platformWallet;
  }

  // Easy revenue queries
  async getPlatformRevenue() {
    const platformWallet = await this.getPlatformWallet();
    return {
      totalRevenue: platformWallet.balance.total,
      availableRevenue: platformWallet.balance.available,
      wallet: platformWallet,
    };
  }
  /**
   * Record a payment transaction (user pays)
   */
  async recordPayment(
    userId,
    providerId,
    bookingId,
    breakdown,
    notificationService = null,
  ) {
    try {
      const providerWallet = await this.getOrCreateWallet(
        providerId,
        "Provider",
      );

      // Record balance snapshots
      const providerBalanceBefore = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      // Add to provider's pending balance (escrow)
      await providerWallet.addPending(breakdown.agreedPrice);

      const providerBalanceAfter = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      // Create transaction record
      const transaction = await Transaction.create({
        reference: this.generateReference("PAY"),
        type: "payment",
        from: {
          userId,
          userModel: "Buyer",
        },
        to: {
          userId: providerId,
          userModel: "Provider",
          walletId: providerWallet._id,
        },
        amount: breakdown.totalAmount,
        breakdown,
        bookingId,
        gateway: {
          name: "paystack",
        },
        balances: {
          before: providerBalanceBefore,
          after: providerBalanceAfter,
        },
        status: "completed",
        description: `Payment for booking #${bookingId}`,
        completedAt: new Date(),
      });

      await this.recordPlatformFee(breakdown.serviceFee, bookingId);

      // Send notification to provider
      if (notificationService) {
        try {
          await notificationService.notifyProvider(providerId, {
            type: "payment_recieved",
            title: "💰 Payment Secured in Escrow",
            message: `₦${breakdown.agreedPrice} has been secured in escrow for booking #${bookingId}. Complete the service to receive payment.`,
            bookingId,
            amount: breakdown.agreedPrice,
            pendingBalance: providerBalanceAfter.pending,
          })

            await notificationService.notifyUser(userId._id, {
                  type: "payment_received",
                  title: "✅ Payment Successful",
                  message: `Your payment is secured. Provider can now start the service.`,
                  bookingId
                });
        } catch (notifyError) {
          console.error(
            "Failed to send escrow notification to provider:",
            notifyError.message,
          );
        }
      }

      return transaction;
    } catch (error) {
      console.error("Record payment error:", error);
      throw error;
    }
  }

  /**
   * alletService escrow (service completed)
   */
  async releaseEscrow(
    providerId,
    amount,
    bookingId,
    notificationService = null,
  ) {
    try {
      const wallet = await this.getOrCreateWallet(providerId, "Provider");

      const balanceBefore = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Move from pending to available
      await wallet.movePendingToAvailable(amount);

      const balanceAfter = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Create transaction
      const transaction = await Transaction.create({
        reference: this.generateReference("REL"),
        type: "escrow_release",
        to: {
          userId: providerId,
          userModel: "Provider",
          walletId: wallet._id,
        },
        amount,
        bookingId,
        balances: {
          before: balanceBefore,
          after: balanceAfter,
        },
        status: "completed",
        description: `Payment released for completed booking #${bookingId}`,
        completedAt: new Date(),
      });

      // Send notification to provider
      if (notificationService) {
        try {
          await notificationService.notifyProvider(providerId, {
            type: "funds_released",
            title: "✅ Payment Released",
            message: `₦${amount} has been released from escrow for booking #${bookingId}. Check your available balance.`,
            bookingId,
            amount,
            availableBalance: balanceAfter.available,
          });
        } catch (notifyError) {
          console.error(
            "Failed to send escrow release notification:",
            notifyError.message,
          );
        }
      }

      return transaction;
    } catch (error) {
      console.error("Release escrow error:", error);
      throw error;
    }
  }

  /**
   * Process payout (transfer to bank)
   */
  async processPayout(providerId, amount, accountNumber, paystackReference) {
    try {
      const wallet = await this.getOrCreateWallet(providerId, "Provider");

      if (wallet.balance.available < amount) {
        throw new Error("Insufficient balance");
      }

      const balanceBefore = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Debit wallet
      await wallet.debit(amount);

      const balanceAfter = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Create transaction
      const transaction = await Transaction.create({
        reference: this.generateReference("WTH"),
        type: "payout",
        from: {
          userId: providerId,
          userModel: "Provider",
          walletId: wallet._id,
        },
        amount,
        gateway: {
          name: "paystack",
          reference: paystackReference,
        },
        balances: {
          before: balanceBefore,
          after: balanceAfter,
        },
        accountNumber,
        status: "processing",
        description: `Withdrawal to ${accountNumber}`,
      });

      return transaction;
    } catch (error) {
      console.error("Process payout error:", error);
      throw error;
    }
  }

  // Withdraw money (provider withdraws to bank)

  async withdraw(providerId, amount, bankDetails) {
    try {
      const wallet = await this.getOrCreateWallet(
        providerId,
        "ServiceProvider",
      );

      // Check if sufficient balance
      if (wallet.balance.available < amount) {
        throw new Error("Insufficient balance");
      }

      const balanceBefore = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Debit wallet
      await wallet.debit(amount);

      const balanceAfter = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Create transaction record
      const transaction = await WalletTransaction.create({
        walletId: wallet._id,
        type: "withdrawal",
        amount: -amount,
        balanceBefore,
        balanceAfter,
        reference: this.generateReference("WTH"),
        description: `Withdrawal to ${bankDetails.accountNumber}`,
        metadata: {
          bankDetails,
          withdrawalMethod: "bank_transfer",
        },
        status: "pending",
      });

      return { wallet, transaction };
    } catch (error) {
      console.error("Withdrawal error:", error);
      throw error;
    }
  }

  // Fund user wallet (add money to user account)

  async fundUserWallet(
    userId,
    amount,
    paymentReference,
    notificationService = null,
  ) {
    try {
      const existingTx = await Transaction.findOne({
        "gateway.reference": paymentReference,
        type: "credit",
      });

      if (existingTx) {
        const wallet = await this.getOrCreateWallet(userId, "Buyer");

        return {
          wallet,
          transaction: existingTx,
          alreadyProcessed: true,
        };
      }
      const wallet = await this.getOrCreateWallet(userId, "Buyer");

      const balanceBefore = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Add to available balance
      await wallet.credit(amount, "topup");

      const balanceAfter = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      // Create transaction record
      const transaction = await Transaction.create({
        // reference: this.generateReference('FUND'),
        reference: paymentReference,
        type: "credit",
        to: {
          userId,
          userModel: "Buyer",
          walletId: wallet._id,
        },
        amount,
        gateway: {
          name: "paystack",
          reference: paymentReference,
        },
        balances: {
          before: balanceBefore,
          after: balanceAfter,
        },
        status: "completed",
        description: `Wallet funded with ₦${amount}`,
        completedAt: new Date(),
      });

      console.log(`✅ User wallet funded: ₦${amount} for user ${userId}`);

      // Send notification if service is provided
      if (notificationService) {
        try {
          await notificationService.notifyUser(userId, {
            type: "wallet_funded",
            title: "Wallet Funded Successfully",
            message: `Your wallet has been credited with ₦${amount}. New available balance: ₦${balanceAfter.available}`,
            amount,
            newBalance: balanceAfter.available,
          });
        } catch (notifyError) {
          console.error(
            "Failed to send wallet funding notification:",
            notifyError.message,
          );
        }
      }

      return { wallet, transaction, alreadyProcessed: false };
    } catch (error) {
      console.error("Fund wallet error:", error);
      throw error;
    }
  }

  // Pay from user wallet balance (instead of Paystack)

 async payFromWallet(userId, providerId, amount, bookingId, breakdown, notificationService = null) {
  try {
    const paymentAmount = parseFloat(amount);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      throw new Error("Invalid payment amount");
    }

    // Get buyer's wallet
    const buyerWallet = await this.getOrCreateWallet(userId, "Buyer");

    console.log("💰 Buyer Wallet before payment:", {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    });

    // Check if sufficient balance
    if (buyerWallet.balance.available < paymentAmount) {
      throw new Error(
        `Insufficient wallet balance. ` +
          `Required: ₦${amount}, Available: ₦${buyerWallet.balance.available}`,
      );
    }

    const buyerBalanceBefore = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    // Debit buyer's available balance
    buyerWallet.balance.available -= paymentAmount;
    buyerWallet.lastTransactionAt = new Date();
    await buyerWallet.save();

    const buyerBalanceAfter = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    // Create transaction record
    const transaction = await Transaction.create({
      reference: this.generateReference("WPAY"),
      type: "payment",
      from: {
        userId,
        userModel: "Buyer",
        walletId: buyerWallet._id,
      },
      to: {
        userId: providerId,
        userModel: "Provider",
      },
      amount: paymentAmount,
      agreedPrice: paymentAmount,
      bookingId,
      breakdown: breakdown || {
        serviceCharge: paymentAmount,
        platformFee: 0,
        total: paymentAmount,
      },
      balances: {
        before: buyerBalanceBefore,
        after: buyerBalanceAfter,
      },
      status: "completed",
      description: `Payment from wallet for booking #${bookingId}`,
      paidAt: new Date(),
      completedAt: new Date(),
    });

    // Update booking - Move money to escrow (same as verifyPayment)
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        status: "paid_escrow",
        "payment.method": "wallet",
        "payment.escrowStatus": "held",
        "payment.paidAt": new Date(),
        "payment.escrowAmount": paymentAmount,
        "payment.transactionReference": transaction.reference,
      },
      { new: true },
    )
      .populate("userId", "fullName email")
      .populate("providerId", "userId");

    if (!booking) {
      throw new Error("Booking not found");
    }

    // Record payment in wallet service (credits provider's pending balance)
    await this.recordPayment(
      userId,
      providerId,
      booking._id,
      breakdown || {
        serviceCharge: paymentAmount,
        platformFee: 0,
        total: paymentAmount,
      },
      notificationService,
    );

    console.log(`✅ Paid from wallet: ₦${amount} for booking ${bookingId}`);

    // Send notifications if service is provided
    if (notificationService) {
      try {
        // Notify provider that payment is secured
        await notificationService.createNotification({
          providerId,
          type: "payment_received",
          title: "💰 Payment Secured",
          message: `Payment of ₦${paymentAmount.toLocaleString()} for your ${booking.serviceType} booking is now in escrow. Complete the service to receive payment.`,
          data: {
            bookingId: booking._id,
            amount: paymentAmount,
          },
        });

        // Notify user
        await notificationService.createNotification({
          userId,
          type: "payment_sent",
          title: "✅ Payment Successful",
          message: `Your payment of ₦${paymentAmount.toLocaleString()} is secured. Provider can now start the service. New available balance: ₦${buyerBalanceAfter.available.toLocaleString()}`,
          data: {
            bookingId: booking._id,
            amount: paymentAmount,
            newBalance: buyerBalanceAfter.available,
          },
        });
      } catch (notifyError) {
        console.error(
          "Failed to send wallet payment notifications:",
          notifyError.message,
        );
      }
    }

    return {
      success: true,
      message: "Payment completed and funds secured in escrow",
      booking,
      transaction,
      wallet: buyerWallet,
    };
  } catch (error) {
    console.error("Pay from wallet error:", error);
    throw error;
  }
}
  /**
   * Get transaction history
   */
  // async getTransactionHistory(userId, userModel, options = {}) {
  //   const { page = 1, limit = 20, type, status } = options;

  //   const query = {
  //     $or: [
  //       { 'from.userId': userId, 'from.userModel': userModel },
  //       { 'to.userId': userId, 'to.userModel': userModel }
  //     ]
  //   };

  //   if (type) query.type = type;
  //   if (status) query.status = status;

  //   const transactions = await Transaction.find(query)
  //     .sort({ createdAt: -1 })
  //     .limit(limit)
  //     .skip((page - 1) * limit)
  //     .populate('bookingId', 'serviceType status')
  //     .lean();

  //   const total = await Transaction.countDocuments(query);

  //   // Format transactions (determine if credit or debit)
  //   const formatted = transactions.map(txn => {
  //     const isCredit = txn.to?.userId?.toString() === userId.toString();

  //     return {
  //       ...txn,
  //       direction: isCredit ? 'credit' : 'debit',
  //       displayAmount: isCredit ? `+₦${txn.amount}` : `-₦${txn.amount}`
  //     };
  //   });

  //   return {
  //     transactions: formatted,
  //     pagination: {
  //       page,
  //       limit,
  //       total,
  //       pages: Math.ceil(total / limit)
  //     }
  //   };
  // }

  async getTransactionHistory(userId, userModel, options = {}) {
    const { page = 1, limit = 20, type, status } = options;

    // ✅ More flexible query - search across all models for this userId
    const query = {
      $or: [{ "from.userId": userId }, { "to.userId": userId }],
    };

    if (type) query.type = type;
    if (status) query.status = status;

    console.log("🔍 Transaction query:", JSON.stringify(query, null, 2));

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("bookingId", "serviceType status")
      .lean();

    const total = await Transaction.countDocuments(query);

    console.log(
      `✅ Found ${transactions.length} transactions out of ${total} total`,
    );

    // Format transactions
    const formatted = transactions.map((txn) => {
      const isCredit = txn.to?.userId?.toString() === userId.toString();

      return {
        ...txn,
        direction: isCredit ? "credit" : "debit",
        displayAmount: isCredit ? `+₦${txn.amount}` : `-₦${txn.amount}`,
      };
    });

    return {
      transactions: formatted,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getBalance(ownerId, ownerModel) {
    const wallet = await this.getOrCreateWallet(ownerId, ownerModel);

    return {
      available: wallet.balance.available,
      pending: wallet.balance.pending,
      total: wallet.balance.total,
      totalEarnings: wallet.totalEarnings,
      totalWithdrawals: wallet.totalWithdrawals,
    };
  }

  /**
   * Get wallet summary
   */
  async getWalletSummary(userId, userModel) {
    const wallet = await this.getOrCreateWallet(userId, userModel);

    // Get transaction stats
    const stats = await Transaction.aggregate([
      {
        $match: {
          $or: [
            { "from.userId": mongoose.Types.ObjectId(userId) },
            { "to.userId": mongoose.Types.ObjectId(userId) },
          ],
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      balance: wallet.balance,
      totalEarnings: wallet.totalEarnings,
      totalWithdrawals: wallet.totalWithdrawals,
      stats,
    };
  }

  /**
   * Helper: Get or create wallet
   */
  async getOrCreateWallet(ownerId, ownerModel) {
    let wallet = await Wallet.findOne({ ownerId, ownerModel });

    if (!wallet) {
      wallet = await Wallet.create({
        ownerId,
        ownerModel,
        balance: {
          available: 0,
          pending: 0,
          total: 0,
        },
      });
    }

    return wallet;
  }

  /**
   * Generate unique reference
   */
  generateReference(prefix = "TXN") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }
}

module.exports = new WalletService();
