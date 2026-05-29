const Wallet = require("../../models/Wallet");
const Transaction = require("../../models/Transaction");
const Booking = require("../../models/Bookings");
const Buyer = require("../../models/ServiceUser");
const mongoose = require("mongoose");
const discountService = require("./discount.service");

class WalletService {
  constructor() {
    // Platform "account" for bookkeeping only
    this.PLATFORM_WALLET_ID = "000000000000000000000001";
    this.WALLET_FUNDING_DAILY_LIMIT = 20000;
  }

  getLagosDayRange(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - 60 * 60 * 1000);
    const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - 60 * 60 * 1000);
    return { start, end };
  }

  async getUserDailyWalletFundingTotal(userId, date = new Date()) {
    const { start, end } = this.getLagosDayRange(date);
    const result = await Transaction.aggregate([
      {
        $match: {
          type: "credit",
          status: "completed",
          "to.userId": new mongoose.Types.ObjectId(userId),
          "metadata.purpose": "wallet_funding",
          createdAt: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    return Number(result?.[0]?.total ?? 0);
  }

  async getRemainingDailyWalletFundingLimit(userId, date = new Date()) {
    const used = await this.getUserDailyWalletFundingTotal(userId, date);
    return Math.max(this.WALLET_FUNDING_DAILY_LIMIT - used, 0);
  }

  async fundUserWallet(userId, amount, reference, notificationService = null) {
    const fundingAmount = Number(amount);
    if (!Number.isFinite(fundingAmount) || fundingAmount <= 0) {
      throw new Error("Invalid wallet funding amount");
    }

    const remainingLimit = await this.getRemainingDailyWalletFundingLimit(
      userId,
    );
    if (fundingAmount > remainingLimit) {
      throw new Error(
        `Daily wallet funding limit exceeded. You can fund up to NGN${remainingLimit.toLocaleString()} more today.`,
      );
    }

    const buyerWallet = await this.getOrCreateWallet(userId, "Buyer");
    const existingFundingTx = await Transaction.findOne({
      reference,
      type: "credit",
      status: "completed",
      "metadata.purpose": "wallet_funding",
    }).select("_id");

    if (existingFundingTx) {
      return {
        alreadyProcessed: true,
        wallet: buyerWallet,
      };
    }

    const buyerBalanceBefore = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    await buyerWallet.credit(fundingAmount, "earning");

    const buyerBalanceAfter = {
      available: buyerWallet.balance.available,
      pending: buyerWallet.balance.pending,
      total: buyerWallet.balance.total,
    };

    const transaction = await Transaction.create({
      reference,
      type: "credit",
      from: {
        userId,
        userModel: "Buyer",
      },
      to: {
        userId,
        userModel: "Buyer",
        walletId: buyerWallet._id,
      },
      amount: fundingAmount,
      balances: {
        before: buyerBalanceBefore,
        after: buyerBalanceAfter,
      },
      metadata: {
        purpose: "wallet_funding",
      },
      status: "completed",
      description: "Wallet funding",
      completedAt: new Date(),
    });

    if (notificationService) {
      try {
        await notificationService.notifyUser(userId, {
          type: "wallet_funded",
          title: "Wallet Funded",
          message: `Your wallet has been funded with NGN${fundingAmount.toLocaleString()}.`,
          reference,
          amount: fundingAmount,
          availableBalance: buyerBalanceAfter.available,
        });
      } catch (notifyError) {
        console.error(
          "Failed to send wallet funding notification:",
          notifyError.message,
        );
      }
    }

    return {
      alreadyProcessed: false,
      wallet: buyerWallet,
      transaction,
    };
  }

  normalizePaymentBreakdown(breakdown = {}) {
    const agreedPrice = Number(breakdown.agreedPrice);
    const serviceFee = Number(breakdown.serviceFee);
    const providerCommission = Number(breakdown.providerCommission);
    const providerReceives = Number(breakdown.providerReceives);
    const totalAmount = Number(breakdown.totalAmount);
    const platformEarns = Number(breakdown.platformEarns);
    const tax = Number(breakdown.tax ?? 0);
    const discountApplied = Boolean(breakdown.discountApplied);
    const discountAmount = Number(breakdown.discountAmount ?? 0);
    const discountPercent = Number(breakdown.discountPercent ?? 0);
    const originalTotalAmount = Number(
      breakdown.originalTotalAmount ?? totalAmount + discountAmount,
    );
    const originalServiceFee = Number(
      breakdown.originalServiceFee ?? serviceFee,
    );
    const originalProviderCommission = Number(
      breakdown.originalProviderCommission ?? providerCommission,
    );
    const originalPlatformEarns = Number(
      breakdown.originalPlatformEarns ?? platformEarns,
    );
    const promoSubsidyAmount = Number(breakdown.promoSubsidyAmount ?? 0);

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
      platformEarns < 0 ||
      tax < 0
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
      tax,
      discountApplied,
      discountAmount,
      discountPercent,
      originalTotalAmount,
      originalServiceFee,
      originalProviderCommission,
      originalPlatformEarns,
      promoSubsidyAmount,
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
          const buyerId = userId?._id ?? userId;
          const subtotal = normalizedBreakdown.agreedPrice;
          const userPlatformFee = normalizedBreakdown.userPlatformFee;
          const providerPlatformFee = normalizedBreakdown.providerCommission;
          const originalProviderPlatformFee =
            normalizedBreakdown.originalProviderCommission ?? providerPlatformFee;
          const discountAmount = normalizedBreakdown.discountAmount;
          const taxAmount = normalizedBreakdown.tax;
          const promoApplied = Boolean(normalizedBreakdown.discountApplied);
          const promoSummary = promoApplied ? "Promo applied" : "No promo applied";

          await notificationService.notifyProvider(providerId, {
            type: "payment_received",
            title: "Payment Secured in Escrow",
            message: `NGN${normalizedBreakdown.providerReceives.toLocaleString()} has been secured in escrow for booking #${bookingId}. Booking fee: NGN${subtotal.toLocaleString()}. Service charge (15%): NGN${originalProviderPlatformFee.toLocaleString()}. Complete the service to receive payment.`,
            bookingId,
            amount: normalizedBreakdown.providerReceives,
            pendingBalance: providerBalanceAfter.pending,
          });

          await notificationService.notifyUser(buyerId, {
            type: "payment_received",
            title: "Payment Successful",
            message: promoApplied
              ? `${promoSummary}. Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Promo discount: NGN${discountAmount.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`
              : `${promoSummary}. Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`,
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
          const subtotal = normalizedBreakdown.agreedPrice;
          const userPlatformFee = normalizedBreakdown.serviceFee;
          const providerPlatformFee = normalizedBreakdown.providerCommission;
          const originalProviderPlatformFee =
            normalizedBreakdown.originalProviderCommission ?? providerPlatformFee;
          const discountAmount = normalizedBreakdown.discountAmount;
          const taxAmount = normalizedBreakdown.tax;
          const promoApplied = Boolean(normalizedBreakdown.discountApplied);

          await notificationService.notifyProvider(providerId, {
            type: "payment_received",
            title: "Payment Secured in Escrow",
            message: `NGN${normalizedBreakdown.providerReceives.toLocaleString()} has been secured in escrow for booking #${bookingId}. Booking fee: NGN${subtotal.toLocaleString()}. Service charge (15%): NGN${originalProviderPlatformFee.toLocaleString()}. Complete the service to receive payment.`,
            bookingId,
            amount: normalizedBreakdown.providerReceives,
            pendingBalance: providerBalanceAfter.pending,
          });

          await notificationService.notifyUser(buyerId, {
            type: "payment_received",
            title: "Payment Successful",
            message: promoApplied
              ? `Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Promo discount: NGN${discountAmount.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`
              : `Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`,
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
          const buyerId = userId?._id ?? userId;
          const subtotal = normalizedBreakdown.agreedPrice;
          const userPlatformFee = normalizedBreakdown.serviceFee;
          const providerPlatformFee = normalizedBreakdown.providerCommission;
          const originalProviderPlatformFee =
            normalizedBreakdown.originalProviderCommission ?? providerPlatformFee;
          const discountAmount = normalizedBreakdown.discountAmount;
          const taxAmount = normalizedBreakdown.tax;
          const promoApplied = Boolean(normalizedBreakdown.discountApplied);

          await notificationService.notifyProvider(providerId, {
            type: "payment_received",
            title: "Payment Secured in Escrow",
            message: `NGN${normalizedBreakdown.providerReceives.toLocaleString()} has been secured in escrow for booking #${bookingId}. Booking fee: NGN${subtotal.toLocaleString()}. Service charge (15%): NGN${originalProviderPlatformFee.toLocaleString()}. Complete the service to receive payment.`,
            bookingId,
            amount: normalizedBreakdown.providerReceives,
            pendingBalance: providerBalanceAfter.pending,
          });

          await notificationService.notifyUser(buyerId, {
            type: "payment_received",
            title: "Payment Successful",
            message: promoApplied
              ? `Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Promo discount: NGN${discountAmount.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`
              : `Your payment is secured. Subtotal: NGN${subtotal.toLocaleString()}. Platform fee: NGN${userPlatformFee.toLocaleString()}. Tax: NGN${taxAmount.toLocaleString()}. Total amount: NGN${normalizedBreakdown.totalAmount.toLocaleString()}.`,
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
          "status payment applyFirstRideDiscount userId providerId agreedPrice calculatedPrice budget serviceType totalAmount serviceFee providerCommission providerReceives platformEarns driverReceives pricingBreakdown pricingMeta",
        )
        .lean();

    if (!existingBooking) {
      throw new Error("Booking not found");
    }

      const pricingBreakdown = existingBooking.pricingBreakdown ?? {};
      const baseBreakdown = pricingBreakdown.breakdown ?? pricingBreakdown ?? {};
      const buyer = await Buyer.findById(userId)
        .select("firstRideDiscountUsed isNewUser")
        .lean();
      const applyFirstRideDiscount = Boolean(
        existingBooking.applyFirstRideDiscount ??
          existingBooking.payment?.discount?.applied ??
          false,
      );
      const promoPricing = discountService.buildLaunchPromoBreakdown({
        user: buyer,
        booking: existingBooking,
        pricingBreakdown: baseBreakdown,
        applyDiscount: applyFirstRideDiscount,
      });
      const agreedPrice = Number(promoPricing.agreedPrice);
      const totalCharge = Number(promoPricing.totalAmount);
      const serviceFee = Number(promoPricing.serviceFee);
      const providerCommission = Number(promoPricing.providerCommission);
      const providerReceives = Number(promoPricing.providerReceives);
      const platformEarns = Number(promoPricing.platformEarns);

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
          tax: Number(baseBreakdown.tax ?? pricingBreakdown.tax ?? 0),
          discountApplied: promoPricing.discountApplied,
          discountAmount: promoPricing.discountAmount,
          discountPercent: promoPricing.discountPercent,
          discountCode: promoPricing.discountCode,
          originalTotalAmount: promoPricing.originalTotalAmount,
          originalServiceFee: promoPricing.originalServiceFee,
          originalProviderCommission: promoPricing.originalProviderCommission,
          originalPlatformEarns: promoPricing.originalPlatformEarns,
          promoSubsidyAmount: promoPricing.promoSubsidyAmount,
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
          "payment.discount": promoPricing.discountApplied
            ? {
                code: promoPricing.discountCode,
                percent: promoPricing.discountPercent,
                amount: promoPricing.discountAmount,
                applied: promoPricing.discountApplied,
                reason: promoPricing.discountReason,
                usedBefore: promoPricing.launchPromoSummary.used,
                usedAfter: promoPricing.launchPromoSummary.usedAfter,
                remainingAfter: promoPricing.launchPromoSummary.remainingAfter,
              }
            : existingBooking.payment?.discount ?? undefined,
          serviceFee,
          providerCommission,
          providerReceives,
          platformEarns,
          totalAmount: totalCharge,
          calculatedPrice: totalCharge,
          agreedPrice,
          pricingBreakdown: {
            ...(pricingBreakdown || {}),
            breakdown: baseBreakdown,
            launchPromo: promoPricing.launchPromo,
            launchPromoSummary: promoPricing.launchPromoSummary,
            discountAmount: promoPricing.discountAmount,
            discountPercent: promoPricing.discountPercent,
            discountApplied: promoPricing.discountApplied,
            discountCode: promoPricing.discountCode,
            originalTotalAmount: promoPricing.originalTotalAmount,
            discountedTotalAmount: promoPricing.totalAmount,
            originalServiceFee: promoPricing.originalServiceFee,
            originalProviderCommission: promoPricing.originalProviderCommission,
            originalPlatformEarns: promoPricing.originalPlatformEarns,
            promoSubsidyAmount: promoPricing.promoSubsidyAmount,
          },
        },
      { new: true },
      )
      .populate("userId", "fullName email")
      .populate("providerId", "userId");

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (promoPricing.discountApplied) {
      await Buyer.findByIdAndUpdate(userId, {
        $inc: { firstRideDiscountUsed: 1 },
        $set: { isNewUser: false },
      });
    } else {
      await Buyer.findByIdAndUpdate(userId, {
        $set: { isNewUser: false },
      });
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
        tax: Number(baseBreakdown.tax ?? pricingBreakdown.tax ?? 0),
        discountApplied: promoPricing.discountApplied,
        discountAmount: promoPricing.discountAmount,
        discountPercent: promoPricing.discountPercent,
        discountCode: promoPricing.discountCode,
        originalTotalAmount: promoPricing.originalTotalAmount,
        originalServiceFee: promoPricing.originalServiceFee,
        originalProviderCommission: promoPricing.originalProviderCommission,
        originalPlatformEarns: promoPricing.originalPlatformEarns,
        promoSubsidyAmount: promoPricing.promoSubsidyAmount,
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
          message: `Payment secured for your ${booking.serviceType} booking. Complete the service to receive payment.`,
          data: {
            bookingId: booking._id,
            amount: providerReceives,
          },
        });

        await notificationService.createNotification({
          userId,
          type: "payment_sent",
          title: "? Payment Successful",
          message: `Your payment is secured. New available balance: NGN${buyerBalanceAfter.available.toLocaleString()}`,
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
      .populate(
        "bookingId",
        "reference serviceType status pricingBreakdown agreedPrice calculatedPrice totalAmount budget serviceFee providerCommission providerReceives platformEarns driverReceives",
      )
      .lean();

    const total = await Transaction.countDocuments(query);

    console.log(
      `✅ Found ${transactions.length} transactions out of ${total} total`,
    );

    // Format transactions
    const formatted = transactions.map((txn) => {
      const isCredit = txn.to?.userId?.toString() === userId.toString();
      const bookingSubtotal = Number(
        txn.bookingId?.pricingBreakdown?.subtotal ??
          txn.bookingId?.agreedPrice ??
          txn.bookingId?.calculatedPrice ??
          txn.bookingId?.totalAmount ??
          txn.bookingId?.budget ??
          NaN,
      );
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
      const isProviderCredit = userModel === "Provider" && isCredit;
      const displayAmountValue =
        isProviderCredit && providerSubtotal !== null ? providerSubtotal : txn.amount;

      return {
        ...txn,
        amount: txn.amount,
        direction: isCredit ? "credit" : "debit",
        displayAmount: isCredit ? `+₦${displayAmountValue}` : `-₦${txn.amount}`,
        displayLabel: isProviderCredit && providerSubtotal !== null ? "Subtotal" : "Amount",
        subtotal: isProviderCredit ? providerSubtotal : null,
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
    const normalizedOwnerId =
      ownerId && ownerId.toString
        ? ownerId
        : new mongoose.Types.ObjectId(ownerId);

    try {
      return await Wallet.findOneAndUpdate(
        { ownerId: normalizedOwnerId, ownerModel },
        {
          $setOnInsert: {
            ownerId: normalizedOwnerId,
            ownerModel,
            balance: {
              available: 0,
              pending: 0,
              total: 0,
            },
          },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      if (error?.code === 11000) {
        const wallet = await Wallet.findOne({
          ownerId: normalizedOwnerId,
          ownerModel,
        });

        if (wallet) {
          return wallet;
        }
      }

      throw error;
    }
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

