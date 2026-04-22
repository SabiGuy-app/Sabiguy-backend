const Wallet = require("../../models/Wallet");
const Transaction = require("../../models/Transaction");
const Booking = require("../../models/Bookings");
const mongoose = require("mongoose");

class WalletService {
  constructor() {
    // Platform "account" for bookkeeping only
    this.PLATFORM_WALLET_ID = "000000000000000000000001";
  }

  normalizePaymentBreakdown(breakdown = {}) {
    const agreedPrice = Number(breakdown.agreedPrice);
    const serviceFee = Number(breakdown.serviceFee);
    const providerCommission = Number(breakdown.providerCommission);
    const providerReceives = Number(breakdown.providerReceives);
    const totalAmount = Number(breakdown.totalAmount);
    const platformEarns = Number(breakdown.platformEarns);

    if (
      !Number.isFinite(agreedPrice) ||
      !Number.isFinite(serviceFee) ||
      !Number.isFinite(providerCommission) ||
      !Number.isFinite(providerReceives) ||
      !Number.isFinite(totalAmount) ||
      !Number.isFinite(platformEarns) ||
      agreedPrice < 0 ||
      serviceFee < 0 ||
      providerCommission < 0 ||
      providerReceives < 0 ||
      totalAmount <= 0 ||
      platformEarns < 0
    ) {
      throw new Error("Invalid payment breakdown");
    }

    return {
      agreedPrice,
      serviceFee,
      providerCommission,
      providerReceives,
      totalAmount,
      platformEarns,
    };
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
      .populate("bookingId", "serviceType status pricingBreakdown")
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

      const providerBalanceBefore = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

      // Add the provider net amount directly from pricing service output.
      await providerWallet.addPending(normalizedBreakdown.providerReceives);

      const providerBalanceAfter = {
        available: providerWallet.balance.available,
        pending: providerWallet.balance.pending,
        total: providerWallet.balance.total,
      };

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
            breakdown: normalizedBreakdown,
            amount: normalizedBreakdown.totalAmount,
            "to.walletId": providerWallet._id,
            "balances.providerBefore": providerBalanceBefore,
            "balances.providerAfter": providerBalanceAfter,
          },
        },
        { new: true },
      );

      if (notificationService) {
        try {
          const buyerId = userId?._id ?? userId;

          await notificationService.notifyProvider(providerId, {
            type: "payment_received",
            title: "💰 Payment Secured in Escrow",
            message: `₦${normalizedBreakdown.providerReceives.toLocaleString()} has been secured in escrow for booking #${bookingId}. Complete the service to receive payment.`,
            bookingId,
            amount: normalizedBreakdown.providerReceives,
            pendingBalance: providerBalanceAfter.pending,
          });

          await notificationService.notifyUser(buyerId, {
            type: "payment_received",
            title: "✅ Payment Successful",
            message: `Your payment is secured. Agreed price: NGN${normalizedBreakdown.agreedPrice.toLocaleString()}. Service fee: NGN${normalizedBreakdown.serviceFee.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`,
            bookingId,
            amount: normalizedBreakdown.totalAmount,
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
        amount: normalizedBreakdown.providerReceives,
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

  async payFromWallet(
    userId,
    providerId,
    amount,
    bookingId,
    notificationService = null,
  ) {
  try {
    const existingBooking = await Booking.findById(bookingId)
      .select(
        "status payment userId providerId agreedPrice calculatedPrice budget serviceType totalAmount serviceFee providerCommission providerReceives platformEarns driverReceives pricingBreakdown",
      )
      .lean();

    if (!existingBooking) {
      throw new Error("Booking not found");
    }

    const agreedPrice = Number(existingBooking.agreedPrice);
    const totalCharge = Number(
      existingBooking.pricingBreakdown?.riderPaysFinal ??
        existingBooking.calculatedPrice ??
        existingBooking.totalAmount,
    );
    const serviceFee = Number(existingBooking.serviceFee ?? 0);
    const providerCommission = Number(existingBooking.providerCommission ?? 0);
    const providerReceives = Number(
      existingBooking.driverReceives ??
        existingBooking.providerReceives ??
        agreedPrice,
    );
    const platformEarns = Number(existingBooking.platformEarns ?? 0);

    if (
      !Number.isFinite(agreedPrice) ||
      !Number.isFinite(totalCharge) ||
      !Number.isFinite(serviceFee) ||
      !Number.isFinite(providerCommission) ||
      !Number.isFinite(providerReceives) ||
      !Number.isFinite(platformEarns) ||
      agreedPrice <= 0 ||
      totalCharge <= 0
    ) {
      throw new Error("Invalid booking pricing data");
    }

    const paymentAlreadyCaptured =
      existingBooking.payment?.paidAt ||
      ["held", "released"].includes(existingBooking.payment?.escrowStatus) ||
      [
        "paid_escrow",
        "in_progress",
        "completed",
        "funds_released",
      ].includes(existingBooking.status);

    if (paymentAlreadyCaptured) {
      throw new Error("This booking has already been paid for");
    }

    const existingPaymentTx = await Transaction.findOne({
      bookingId,
      type: "payment",
      status: "completed",
    }).select("_id");

    if (existingPaymentTx) {
      throw new Error("Payment already recorded for this booking");
    }

    const buyerWallet = await this.getOrCreateWallet(userId, "Buyer");

    console.log("?? Buyer Wallet before payment:", {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    });

    if (buyerWallet.balance.available < totalCharge) {
      throw new Error(
        `Insufficient wallet balance. ` +
          `Required: ${totalCharge}, Available: ?${buyerWallet.balance.available}`,
      );
    }

    const buyerBalanceBefore = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    buyerWallet.balance.available -= totalCharge;
    buyerWallet.balance.total -= totalCharge;
    buyerWallet.lastTransactionAt = new Date();
    await buyerWallet.save();

    const buyerBalanceAfter = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

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
      agreedPrice,
      bookingId,
      breakdown: {
        agreedPrice,
        serviceFee,
        providerCommission,
        providerReceives,
        platformEarns,
        totalAmount: totalCharge,
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

    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        status: "paid_escrow",
        "payment.method": "wallet",
        "payment.escrowStatus": "held",
        "payment.paidAt": new Date(),
        "payment.escrowAmount": totalCharge,
        "payment.providerReceives": providerReceives,
        "payment.transactionReference": transaction.reference,
        serviceFee,
        providerCommission,
        providerReceives,
        platformEarns,
        totalAmount: totalCharge,
      },
      { new: true },
    )
      .populate("userId", "fullName email")
      .populate("providerId", "userId");

    if (!booking) {
      throw new Error("Booking not found");
    }

    await this.recordPayment(
      userId,
      providerId,
      booking._id,
      {
        agreedPrice,
        serviceFee,
        providerCommission,
        providerReceives,
        platformEarns,
        totalAmount: totalCharge,
      },
      notificationService,
    );

    console.log(`? Paid from wallet: ?${amount} for booking ${bookingId}`);

    if (notificationService) {
      try {
        await notificationService.createNotification({
          providerId,
          type: "payment_received",
          title: "?? Payment Secured",
          message: `Payment secured for your ${booking.serviceType} booking. Agreed price: NGN${agreedPrice.toLocaleString()}. Service fee: NGN${serviceFee.toLocaleString()}. Complete the service to receive payment.`,
          data: {
            bookingId: booking._id,
            amount: providerReceives,
          },
        });

        await notificationService.createNotification({
          userId,
          type: "payment_sent",
          title: "? Payment Successful",
          message: `Your payment is secured. Agreed price: NGN${agreedPrice.toLocaleString()}. Service fee: NGN${serviceFee.toLocaleString()}. Total amount: NGN${totalCharge.toLocaleString()}. New available balance: NGN${buyerBalanceAfter.available.toLocaleString()}`,
          data: {
            bookingId: booking._id,
            amount: totalCharge,
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
      const bookingSubtotal = Number(txn.bookingId?.pricingBreakdown?.subtotal);
      const derivedSubtotal =
        Number.isFinite(txn.breakdown?.providerReceives) &&
        Number.isFinite(txn.breakdown?.providerCommission)
          ? Number(txn.breakdown.providerReceives) +
            Number(txn.breakdown.providerCommission)
          : null;
      const providerSubtotal = Number.isFinite(bookingSubtotal)
        ? bookingSubtotal
        : Number.isFinite(derivedSubtotal)
          ? derivedSubtotal
          : null;
      const displayAmountValue =
        isCredit && providerSubtotal !== null ? providerSubtotal : txn.amount;

      return {
        ...txn,
        direction: isCredit ? "credit" : "debit",
        displayAmount: isCredit ? `+₦${displayAmountValue}` : `-₦${txn.amount}`,
        providerSubtotal,
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



