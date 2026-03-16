const Wallet = require("../../models/Wallet");
const Transaction = require("../../models/Transaction");
const Booking = require("../../models/Bookings");
const mongoose = require("mongoose");
const pricingService = require("../services/pricing.service.js");

class WalletService {
  constructor() {
    // Platform "account" for bookkeeping only
    this.PLATFORM_WALLET_ID = "000000000000000000000001";
  }

  normalizePaymentBreakdown(breakdown = {}, fallbackAmount = 0) {
    const safeFallback = Number(fallbackAmount) || 0;
    const agreedPrice = Number(
      breakdown.agreedPrice ?? breakdown.serviceCharge ?? safeFallback,
    );
    const serviceFee = Number(breakdown.serviceFee ?? breakdown.platformFee ?? 0);
    const totalAmount = Number(
      breakdown.totalAmount ?? breakdown.total ?? agreedPrice + serviceFee,
    );

    if (
      !Number.isFinite(agreedPrice) ||
      !Number.isFinite(serviceFee) ||
      !Number.isFinite(totalAmount) ||
      agreedPrice < 0 ||
      serviceFee < 0 ||
      totalAmount <= 0
    ) {
      throw new Error("Invalid payment breakdown");
    }

    return { agreedPrice, serviceFee, totalAmount };
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

  async recordPlatformFee(amount, bookingId, feeType = "platform_fee") {
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

    const transactionType = feeType === "commission" ? "commission" : "platform_fee";
    const description =
      feeType === "commission"
        ? `Provider commission collected for booking #${bookingId}`
        : `Platform fee collected for booking #${bookingId}`;

    await Transaction.create({
      reference: this.generateReference("FEE"),
      type: transactionType,
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
      description,
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

  async getPlatformSummary({ page = 1, limit = 20, type } = {}) {
    const platformWallet = await this.getPlatformWallet();
    const platformId = new mongoose.Types.ObjectId(this.PLATFORM_WALLET_ID);

    const query = {
      $or: [{ "from.userId": platformId }, { "to.userId": platformId }],
    };
    if (type) query.type = type;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .populate("bookingId", "serviceType status")
      .lean();

    const total = await Transaction.countDocuments(query);

    return {
      wallet: platformWallet,
      balance: platformWallet.balance,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      transactions,
    };
  }

  async tipProviderFromWallet(
    userId,
    providerId,
    amount,
    bookingId,
    notificationService = null,
  ) {
    try {
      const tipAmount = Number(amount);
      if (!Number.isFinite(tipAmount) || tipAmount <= 0) {
        throw new Error("Invalid tip amount");
      }

      const buyerWallet = await this.getOrCreateWallet(userId, "Buyer");
      if (buyerWallet.balance.available < tipAmount) {
        throw new Error(
          `Insufficient wallet balance. Required: ${totalCharge}, Available: ₦${buyerWallet.balance.available}`,
        );
      }

      const buyerBalanceBefore = {
        available: buyerWallet.balance.available,
        pending: buyerWallet.balance.pending,
        total: buyerWallet.balance.total,
      };

      buyerWallet.balance.available -= tipAmount;
      buyerWallet.balance.total -= tipAmount;
      buyerWallet.lastTransactionAt = new Date();
      await buyerWallet.save();

      const buyerBalanceAfter = {
        available: buyerWallet.balance.available,
        pending: buyerWallet.balance.pending,
        total: buyerWallet.balance.total,
      };

      const providerWallet = await this.getOrCreateWallet(
        providerId,
        "Provider",
      );
      const providerBalanceBefore = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      await providerWallet.credit(tipAmount, "earning");

      const providerBalanceAfter = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      const transaction = await Transaction.create({
        reference: this.generateReference("TIP"),
        type: "tip",
        from: {
          userId,
          userModel: "Buyer",
          walletId: buyerWallet._id,
        },
        to: {
          userId: providerId,
          userModel: "Provider",
          walletId: providerWallet._id,
        },
        amount: tipAmount,
        bookingId,
        balances: {
          before: buyerBalanceBefore,
          after: buyerBalanceAfter,
        },
        status: "completed",
        description: `Tip for booking #${bookingId}`,
        completedAt: new Date(),
      });

      if (notificationService) {
        try {
          await notificationService.notifyProvider(providerId, {
            type: "tip_received",
            title: "💰 New Tip Received",
            message: `You received a ₦${tipAmount.toLocaleString()} tip for booking #${bookingId}.`,
            bookingId,
            amount: tipAmount,
          });

          await notificationService.notifyUser(userId, {
            type: "tip_sent",
            title: "✅ Tip Sent",
            message: `Your ₦${tipAmount.toLocaleString()} tip was sent successfully.`,
            bookingId,
            amount: tipAmount,
          });
        } catch (notifyError) {
          console.error("Tip notification error:", notifyError.message);
        }
      }

      return {
        success: true,
        transaction,
        buyerBalance: buyerBalanceAfter,
        providerBalance: providerBalanceAfter,
      };
    } catch (error) {
      console.error("Tip from wallet error:", error);
      throw error;
    }
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
      const normalizedBreakdown = this.normalizePaymentBreakdown(breakdown);
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
      await providerWallet.addPending(normalizedBreakdown.agreedPrice);

      const providerBalanceAfter = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      // // Create transaction record
      // const transaction = await Transaction.create({
      //   reference: this.generateReference("PAY"),
      //   type: "payment",
      //   from: {
      //     userId,
      //     userModel: "Buyer",
      //   },
      //   to: {
      //     userId: providerId,
      //     userModel: "Provider",
      //     walletId: providerWallet._id,
      //   },
      //   amount: totalCharge,
      //   breakdown: normalizedBreakdown,
      //   bookingId,
      //   gateway: {
      //     name: "paystack",
      //   },
      //   balances: {
      //     before: providerBalanceBefore,
      //     after: providerBalanceAfter,
      //   },
      //   status: "completed",
      //   description: `Payment for booking #${bookingId}`,
      //   completedAt: new Date(),
      // });

      if (normalizedBreakdown.serviceFee > 0) {
        await this.recordPlatformFee(
          normalizedBreakdown.serviceFee,
          bookingId,
          "platform_fee",
        );
      }

      await Transaction.findOneAndUpdate(
      { bookingId, type: "payment", status: "completed" },
      {
        $set: {
          "to.walletId": providerWallet._id,
          "balances.providerBefore": providerBalanceBefore,
          "balances.providerAfter": providerBalanceAfter,
        },
      }
    );
      // Send notification to provider
      if (notificationService) {
        try {
          await notificationService.notifyProvider(providerId, {
            type: "payment_received",
            title: "💰 Payment Secured in Escrow",
            message: `₦${normalizedBreakdown.agreedPrice} has been secured in escrow for booking #${bookingId}. Complete the service to receive payment.`,
            bookingId,
            amount: normalizedBreakdown.agreedPrice,
            pendingBalance: providerBalanceAfter.pending,
          })

            await notificationService.notifyUser(userId._id, {
                  type: "payment_received",
                  title: "✅ Payment Successful",
          message: `Your payment is secured. Agreed price: NGN${normalizedBreakdown.agreedPrice.toLocaleString()}. Service fee: NGN${normalizedBreakdown.serviceFee.toLocaleString()}. New available balance: NGN${buyerBalanceAfter.available.toLocaleString()}`,
                  bookingId
                });
        } catch (notifyError) {
          console.error(
            "Failed to send escrow notification to provider:",
            notifyError.message,
          );
        }
      }

  return {
      success: true,
      providerWallet,
      providerBalanceAfter,
      amount: normalizedBreakdown.agreedPrice,
    };
      } catch (error) {
      console.error("Record payment error:", error);
      throw error;
    }
  }

 
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
    const normalizedBreakdown = this.normalizePaymentBreakdown(
      breakdown,
      paymentAmount,
    );

    const pricingBreakdown = pricingService.calculatePricingBreakdown(
      normalizedBreakdown.agreedPrice,
    );
    normalizedBreakdown.serviceFee =
      pricingBreakdown.userPays - normalizedBreakdown.agreedPrice;
    normalizedBreakdown.totalAmount = pricingBreakdown.userPays;
    const totalCharge = normalizedBreakdown.totalAmount;
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
    if (buyerWallet.balance.available < totalCharge) {
      throw new Error(
        `Insufficient wallet balance. ` +
          `Required: ${totalCharge}, Available: ₦${buyerWallet.balance.available}`,
      );
    }

    const buyerBalanceBefore = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    // Debit buyer's available balance
    buyerWallet.balance.available -= totalCharge;
    buyerWallet.balance.total -= totalCharge;
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
      amount: totalCharge,
      agreedPrice: normalizedBreakdown.agreedPrice,
      bookingId,
      breakdown: normalizedBreakdown,
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
        "payment.escrowAmount": normalizedBreakdown.agreedPrice,
        "payment.transactionReference": transaction.reference,
        serviceFee: normalizedBreakdown.serviceFee,
        providerCommission:
          pricingBreakdown.platformEarns - normalizedBreakdown.serviceFee,
        platformEarns: pricingBreakdown.platformEarns,
        totalamount: totalCharge,
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
      normalizedBreakdown,
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
          message: `Payment secured for your ${booking.serviceType} booking. Agreed price: NGN${normalizedBreakdown.agreedPrice.toLocaleString()}. Service fee: NGN${normalizedBreakdown.serviceFee.toLocaleString()}. Complete the service to receive payment.`,
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
          message: `Your payment is secured. Agreed price: NGN${normalizedBreakdown.agreedPrice.toLocaleString()}. Service fee: NGN${normalizedBreakdown.serviceFee.toLocaleString()}. New available balance: NGN${buyerBalanceAfter.available.toLocaleString()}`,
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





