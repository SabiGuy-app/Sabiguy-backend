const axios = require("axios");
const crypto = require("crypto");
const Booking = require("../../models/Bookings.js");
const Provider = require("../../models/ServiceProvider.js");
const Buyer = require("../../models/ServiceUser.js");
const notificationService = require("../services/notification.service.js");
const Transaction = require("../../models/Transaction.js");
const WalletService = require("../services/wallet.service.js");

class paymentService {
  constructor() {
    this.paystackBaseURL = "https://api.paystack.co";
    this.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    this.MAX_BANK_WITHDRAWAL_AMOUNT = 2000;
  }

  resolvePaymentBreakdown(booking) {
    const pricingBreakdown = booking?.pricingBreakdown ?? {};
    const baseBreakdown = pricingBreakdown.breakdown ?? pricingBreakdown;
    const subtotal = Number(
      baseBreakdown.subtotal ??
        booking?.agreedPrice ??
        booking?.calculatedPrice ??
        booking?.budget ??
        0,
    );
    const userPlatformFee = Number(
      baseBreakdown.platformFee ??
        pricingBreakdown.originalServiceFee ??
        booking?.serviceFee ??
        0,
    );
    const providerPlatformFee = Number(
      baseBreakdown.driverCommission ??
        pricingBreakdown.originalProviderCommission ??
        booking?.providerCommission ??
        0,
    );
    const providerReceives = Number(
      baseBreakdown.driverReceives ??
        booking?.driverReceives ??
        booking?.providerReceives ??
        Math.max(subtotal - providerPlatformFee, 0),
    );
    const tax = Number(
      baseBreakdown.tax ??
        pricingBreakdown.tax ??
        pricingBreakdown.taxAmount ??
        booking?.tax ??
        0,
    );
    const totalPlatformFee = Number(
      baseBreakdown.platformEarns ??
        pricingBreakdown.originalPlatformEarns ??
        booking?.platformEarns ??
        userPlatformFee + providerPlatformFee,
    );
    const riderPays = Number(
      pricingBreakdown.discountApplied
        ? pricingBreakdown.discountedTotalAmount ??
          baseBreakdown.riderPaysFinal ??
          booking?.totalAmount ??
          booking?.calculatedPrice ??
          subtotal + userPlatformFee
        : baseBreakdown.riderPaysFinal ??
        booking?.totalAmount ??
        booking?.calculatedPrice ??
        subtotal + userPlatformFee,
    );

    return {
      agreedPrice: subtotal,
      serviceFee: userPlatformFee,
      providerCommission: providerPlatformFee,
      providerReceives,
      platformEarns: totalPlatformFee,
      tax,
      totalAmount: riderPays,
    };
  }

  async initializePayment(
    bookingId,
    userId,
    pickupNote = null,
  ) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate("userId", "email fullName")
        .populate("providerId");

      if (!booking) {
        throw new Error("Booking not found");
      }

      // 🔐 Ownership check
      if (booking.userId._id.toString() !== userId.toString()) {
        throw new Error("Unauthorized: This is not your booking");
      }

      if (booking.status === "paid_escrow") {
        throw new Error("Booking already paid for");
      }

      if (
        booking.status !== "provider_selected" &&
        booking.status !== "provider_accepted" &&
        booking.status !== "payment_pending"

      ) {
        throw new Error("Booking must have a selected provider before payment");
      }

      const paymentBreakdown = {
        ...this.resolvePaymentBreakdown(booking),
        ...(booking.pricingBreakdown || {}),
        discountApplied: booking.payment?.discount?.applied ?? false,
        discountAmount: booking.payment?.discount?.amount ?? 0,
        discountPercent: booking.payment?.discount?.percent ?? 0,
        discountCode: booking.payment?.discount?.code ?? null,
        discountReason: booking.payment?.discount?.reason ?? null,
        launchPromo:
          booking.pricingBreakdown?.launchPromo ??
          (booking.payment?.discount?.applied
            ? {
                code: booking.payment?.discount?.code ?? null,
                percent: booking.payment?.discount?.percent ?? 0,
                applied: true,
                eligible: true,
                used: booking.payment?.discount?.usedBefore ?? null,
                remaining: booking.payment?.discount?.remainingAfter ?? null,
                amount: booking.payment?.discount?.amount ?? 0,
                baseAmount: booking.pricingBreakdown?.originalTotalAmount ?? null,
                reason: booking.payment?.discount?.reason ?? null,
              }
            : null),
        launchPromoSummary: {
          used:
            booking.payment?.discount?.usedBefore ??
            booking.pricingBreakdown?.launchPromoSummary?.used ??
            null,
          usedAfter:
            booking.payment?.discount?.usedAfter ??
            booking.pricingBreakdown?.launchPromoSummary?.usedAfter ??
            null,
          remainingAfter:
            booking.payment?.discount?.remainingAfter ??
            booking.pricingBreakdown?.launchPromoSummary?.remainingAfter ??
            null,
        },
        paymentBreakdown: booking.pricingBreakdown?.paymentBreakdown ?? {
          subtotal: booking.pricingBreakdown?.subtotal ?? null,
          grossEarnings: booking.pricingBreakdown?.grossEarnings ?? null,
          riderPays: booking.totalAmount ?? null,
          userPlatformFee: booking.serviceFee ?? null,
          providerPlatformFee: booking.providerCommission ?? null,
          totalPlatformFee: booking.platformEarns ?? null,
          providerReceives: booking.providerReceives ?? null,
        },
        originalTotalAmount:
          booking.pricingBreakdown?.originalTotalAmount ?? booking.totalAmount,
        originalServiceFee:
          booking.pricingBreakdown?.originalServiceFee ?? booking.serviceFee,
        originalProviderCommission:
          booking.pricingBreakdown?.originalProviderCommission ??
          booking.providerCommission,
        originalPlatformEarns:
          booking.pricingBreakdown?.originalPlatformEarns ?? booking.platformEarns,
        promoSubsidyAmount:
          booking.pricingBreakdown?.promoSubsidyAmount ??
          booking.payment?.discount?.amount ??
          0,
      };

      const agreedPrice = paymentBreakdown.agreedPrice;
      const totalAmount = paymentBreakdown.totalAmount;
      const serviceFee = paymentBreakdown.serviceFee;
      const providerCommission = paymentBreakdown.providerCommission;
      const providerReceives = paymentBreakdown.providerReceives;
      const platformEarns = paymentBreakdown.platformEarns;

      if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new Error("Missing final payment amount on booking");
      }

      if (pickupNote) {
        booking.pickupNote = String(pickupNote).trim();
      }

      // Update booking with payment details
      booking.agreedPrice = agreedPrice;
      booking.serviceFee = serviceFee;
      booking.providerCommission = providerCommission;
      booking.providerReceives = providerReceives;
      booking.platformEarns = platformEarns;
      booking.totalAmount = totalAmount;
      booking.pricingBreakdown = {
        ...(booking.pricingBreakdown || {}),
        launchPromo: paymentBreakdown.launchPromo,
        discountAmount: paymentBreakdown.discountAmount,
        discountPercent: paymentBreakdown.discountPercent,
        discountApplied: paymentBreakdown.discountApplied,
        discountCode: paymentBreakdown.discountCode,
        originalTotalAmount: paymentBreakdown.originalTotalAmount,
        discountedTotalAmount: paymentBreakdown.totalAmount,
      };
      booking.payment = {
        ...(booking.payment || {}),
        discount: {
          code: paymentBreakdown.discountCode,
          percent: paymentBreakdown.discountPercent,
          amount: paymentBreakdown.discountAmount,
          applied: paymentBreakdown.discountApplied,
          reason: paymentBreakdown.discountReason,
          usedBefore: paymentBreakdown.launchPromoSummary.used,
          usedAfter: paymentBreakdown.launchPromoSummary.usedAfter,
          remainingAfter: paymentBreakdown.launchPromoSummary.remainingAfter,
        },
      };

      const paystackResponse = await axios.post(
        `${this.paystackBaseURL}/transaction/initialize`,
        {
          email: booking.userId.email,
          amount: totalAmount * 100,
          currency: "NGN",
          reference: this.generateReference(),
          callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
          metadata: {
            bookingId: booking._id.toString(),
            buyerId: userId,
            providerId: booking.providerId?._id.toString(),
            serviceType: booking.serviceType,
            pickupNote: booking.pickupNote || null,
            agreedPrice,
            serviceFee,
            totalAmount,
            providerCommission,
            providerReceives,
            platformEarns,
            tax: paymentBreakdown.tax ?? 0,
            discountApplied: paymentBreakdown.discountApplied,
            discountAmount: paymentBreakdown.discountAmount,
            discountPercent: paymentBreakdown.discountPercent,
            discountCode: paymentBreakdown.discountCode,
            originalTotalAmount: paymentBreakdown.originalTotalAmount,
            custom_fields: [
              {
                display_name: "Booking ID",
                variable_name: "booking_id",
                value: booking._id.toString(),
              },
              {
                display_name: "Service Type",
                variable_name: "service_type",
                value: booking.serviceType,
              },
              {
                display_name: "Pickup Note",
                variable_name: "pickup_note",
                value: booking.pickupNote || "N/A",
              },
            ],
          },
          channels: ["card", "bank", "ussd", "mobile_money", "bank_transfer"],
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!paystackResponse.data.status) {
        throw new Error("Failed to initialize payment with Paystack");
      }

      booking.payment = {
        paystackRef: paystackResponse.data.data.reference,
        escrowStatus: "pending",
        escrowAmount: totalAmount,
        providerReceives,
        discount: {
          code: paymentBreakdown.discountCode,
          percent: paymentBreakdown.discountPercent,
          amount: paymentBreakdown.discountAmount,
          applied: paymentBreakdown.discountApplied,
          reason: paymentBreakdown.discountReason,
          usedBefore: paymentBreakdown.launchPromoSummary.used,
          usedAfter: paymentBreakdown.launchPromoSummary.usedAfter,
          remainingAfter: paymentBreakdown.launchPromoSummary.remainingAfter,
        },
      };
      booking.status = "payment_pending";
      await booking.save();

      await Transaction.create({
        reference: paystackResponse.data.data.reference,
        type: "payment",
        from: {
          userId,
          userModel: "Buyer",
        },
        to: {
          userId: booking.providerId._id,
          userModel: "Provider",
        },
        amount: totalAmount,
        breakdown: {
          agreedPrice,
          subtotal: agreedPrice,
          grossEarnings: agreedPrice,
          riderPays: totalAmount,
          serviceFee,
          userPlatformFee: serviceFee,
          providerCommission,
          providerPlatformFee: providerCommission,
          providerReceives,
          driverReceives: booking.driverReceives ?? null,
          platformEarns,
          totalPlatformFee: platformEarns,
          totalAmount,
          tax: paymentBreakdown.tax ?? 0,
          discountApplied: paymentBreakdown.discountApplied,
          discountAmount: paymentBreakdown.discountAmount,
          discountPercent: paymentBreakdown.discountPercent,
          discountCode: paymentBreakdown.discountCode,
          originalTotalAmount: paymentBreakdown.originalTotalAmount,
          originalServiceFee: paymentBreakdown.originalServiceFee,
          originalProviderCommission: paymentBreakdown.originalProviderCommission,
          originalPlatformEarns: paymentBreakdown.originalPlatformEarns,
          promoSubsidyAmount: paymentBreakdown.promoSubsidyAmount,
        },
        metadata: {
          platformEarns,
          providerCommission,
          providerReceives,
          discountApplied: paymentBreakdown.discountApplied,
          discountAmount: paymentBreakdown.discountAmount,
          discountPercent: paymentBreakdown.discountPercent,
          discountCode: paymentBreakdown.discountCode,
        },
        bookingId: booking._id,
        gateway: {
          name: "paystack",
          reference: paystackResponse.data.data.reference,
        },
        status: "pending",
        description: `Payment for ${booking.serviceType} booking #${booking._id}`,
      });

      return {
        authorizationUrl: paystackResponse.data.data.authorization_url,
        accessCode: paystackResponse.data.data.access_code,
        reference: paystackResponse.data.data.reference,
        totalAmount,
        agreedPrice,
        serviceFee,
        providerCommission,
        providerReceives,
        platformEarns,
        tax: paymentBreakdown.tax ?? 0,
        discountApplied: paymentBreakdown.discountApplied,
        discountAmount: paymentBreakdown.discountAmount,
        discountPercent: paymentBreakdown.discountPercent,
        discountCode: paymentBreakdown.discountCode,
        originalTotalAmount: paymentBreakdown.originalTotalAmount,
        paymentBreakdown: {
          agreedPrice,
          subtotal: agreedPrice,
          serviceFee,
          providerCommission,
          providerReceives,
          platformEarns,
          tax: paymentBreakdown.tax ?? 0,
          totalAmount,
          discountApplied: paymentBreakdown.discountApplied,
          discountAmount: paymentBreakdown.discountAmount,
          discountPercent: paymentBreakdown.discountPercent,
          discountCode: paymentBreakdown.discountCode,
          originalTotalAmount: paymentBreakdown.originalTotalAmount,
        },
      };
    } catch (error) {
      console.error("Initialize payment error:", error);
      throw error;
    }
  }

  // Verify payment

  async verifyPayment(reference) {
    try {
      const transaction = await Transaction.findOne({
        reference,
        type: "payment",
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      if (transaction.status === "completed") {
        return {
          success: true,
          message: "Payment already verified",
          bookingId: transaction.bookingId,
          transaction,
        };
      }
      const paystackResponse = await axios.get(
        `${this.paystackBaseURL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      if (!paystackResponse.data.status) {
        throw new Error("Payment verification failed");
      }

      const paymentData = paystackResponse.data.data;

      if (paymentData.status !== "success") {
        throw new Error(
          `Payment not successful. Status: ${paymentData.status}`,
        );
      }

      const updatedTransaction = await Transaction.findOneAndUpdate(
        { _id: transaction._id, status: "pending" },
        {
          status: "completed",
          paystackResponse: paymentData,
          paidAt: new Date(),
        },
        { new: true },
      );
      if (!updatedTransaction) {
        return {
          success: true,
          message: "Payment already processed by another request",
        };
      }

      // Update booking - Move money to escrow
      const booking = await Booking.findByIdAndUpdate(
        updatedTransaction.bookingId,
        {
          status: "paid_escrow",
          "payment.escrowStatus": "held",
          "payment.paidAt": new Date(),
          "payment.escrowAmount":
            transaction.breakdown?.totalAmount ?? transaction.amount ?? 0,
        },
        { new: true },
      )
        .populate("userId", "fullName email")
        .populate("providerId", "userId");

      if (booking?.payment?.discount?.applied) {
        await Buyer.findByIdAndUpdate(booking.userId._id, {
          $inc: { firstRideDiscountUsed: 1 },
          $set: { isNewUser: false },
        });
      } else {
        await Buyer.findByIdAndUpdate(booking.userId._id, {
          $set: { isNewUser: false },
        });
      }

      await WalletService.recordPayment(
        updatedTransaction.from.userId,
        updatedTransaction.to.userId,
        booking._id,
        updatedTransaction.breakdown,
        notificationService,
      );

      // Notify provider that payment is Your payment is secured. Agreed price: NGN4,300. Service fee: NGN0. Total amount: NGN4,300.

      // if (booking.providerId) {
      //   await notificationService.notifyProvider(booking.providerId._id, {
      //     type: "payment_received",
      //     title: "💰 Payment Secured",
      //     message: `Payment for your ${booking.serviceType} booking is now in escrow. Complete the service to receive payment.`,
      //     bookingId: booking._id,
      //   });
      // }

      // // Notify user
      // await notificationService.notifyUser(booking.userId._id, {
      //   type: "payment_received",
      //   title: "✅ Payment Successful",
      //   message: `Your payment is secured. Provider can now start the service.`,
      //   bookingId: booking._id,
      // });

      return {
        success: true,
        message: "Payment verified and funds secured in escrow",
        booking,
        transaction: updatedTransaction,
      };
    } catch (error) {
      console.error("Verify payment error:", error);
      throw error;
    }
  }

  async releaseEscrow(bookingId, userId) {
    try {
      const booking = await Booking.findById(bookingId)
        .populate("userId", "email firstName")
        .populate("providerId");

      if (!booking) {
        throw new Error("Booking not found");
      }

      if (booking.userId._id.toString() !== userId.toString()) {
        throw new Error("Unauthorized: Only the buyer can release escrow");
      }
      if (booking.status === "funds_released") {
        return {
          success: true,
          message: "Payment already released from escrow",
        };
      }
      if (booking.status !== "user_accepted_completion") {
        throw new Error(
          "Booking completion must be accepted before releasing payment",
        );
      }

      if (booking.payment.escrowStatus !== "held") {
        return {
          success: true,
          message: "No funds in escrow or already released",
        };
      }

      const provider = await Provider.findById(booking.providerId._id);
      if (!provider) {
        throw new Error("Provider record missing");
      }

      const providerPayout =
        booking.driverReceives ??
        booking.payment?.providerReceives ??
        booking.providerReceives;
      const commission = booking.providerCommission;

      if (!Number.isFinite(providerPayout) || !Number.isFinite(commission)) {
        throw new Error("Missing pricing breakdown on booking");
      }

      if (commission > 0) {
        await WalletService.recordPlatformFee(
          commission,
          booking._id,
          "commission",
        );
      }

      // Check if escrow release transaction already exists to prevent duplicates
      const existingTx = await Transaction.findOne({
        bookingId: booking._id,
        type: "escrow_release",
        status: "completed",
      });

      let escrowTransaction = existingTx;
      if (!existingTx) {
        // Move funds from pending to available in provider's wallet
        escrowTransaction = await WalletService.releaseEscrow(
          booking.providerId._id,
          providerPayout,
          booking._id,
          notificationService,
        );
        console.log("✅ Escrow release transaction created and wallet updated");
      }
      console.log("✅ Escrow released to provider wallet");

      // Update booking
      booking.payment.escrowStatus = "released";
      booking.payment.releasedAt = new Date();
      booking.status = "funds_released";
      await booking.save();
      console.log("✅ Booking updated to funds_released");

      // Notify provider
      if (booking.providerId) {
        await notificationService.notifyProvider(booking.providerId._id, {
          type: "funds_released",
          title: "💰 Payment Released",
          message: `₦${providerPayout.toLocaleString()} has been added to your wallet for booking #${booking._id}`,
          bookingId: booking._id,
        });
      }

      return {
        success: true,
        message: "Payment released to provider wallet",
        amount: providerPayout,
        transaction: escrowTransaction,
      };
    } catch (error) {
      console.error("Release escrow error:", error);
      throw error;
    }
  }
  /**
   * Refund payment to user
   * Called when booking is cancelled before completion
   */
  async refundPayment(bookingId, reason) {
    try {
      const booking = await Booking.findById(bookingId).populate(
        "userId",
        "email fullName",
      );

      if (!booking) {
        throw new Error("Booking not found");
      }

      if (!booking.payment.escrowAmount !== "held") {
        throw new Error("No funds to refund");
      }

      const refundAmount = booking.payment.escrowAmount;

      const refundResponse = await axios.post(
        `${this.paystackBaseURL}/refund`,
        {
          transaction: booking.payment.paystackRef,
          amount: refundAmount * 100,
          currency: "NGN",
          customer_note: reason || "Booking cancelled - Refund processed",
          merchant_note: `Refund for cancelled booking ${booking._id}`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!refundResponse.data.status) {
        throw new Error("Failed to process refund");
      }

      // Update booking
      booking.payment.escrowStatus = "refunded";
      booking.payment.refundedAt = new Date();
      booking.payment.refundReference = refundResponse.data.data.reference;
      await booking.save();

      await Transaction.create({
        reference: refundResponse.data.data.reference,
        type: "refund",
        from: {
          userId: booking.providerId,
          userModel: "Provider",
        },
        to: {
          userId: booking.userId._id,
          userModel: "Buyer",
        },
        amount: refundAmount,
        bookingId: booking._id,
        gateway: {
          name: "paystack",
          reference: refundResponse.data.data.reference,
          response: refundResponse.data.data,
        },
        status: "completed",
        description: `Refund for cancelled booking #${booking._id}. Reason: ${reason}`,
        completedAt: new Date(),
      });

      await WalletService.refundToUser(
        booking.userId._id,
        booking.providerId,
        refundAmount,
        booking._id,
        reason,
      );

      // Notify user
      await notificationService.notifyUser(booking.userId._id, {
        type: "refund_processed",
        title: "💸 Refund Processed",
        message: `₦${refundAmount.toLocaleString()} has been refunded to your account`,
        bookingId: booking._id,
      });

      return {
        success: true,
        message: "Refund processed successfully",
        amount: refundAmount,
        reference: refundResponse.data.data.reference,
      };
    } catch (error) {
      console.error("Refund payment error:", error);
      throw error;
    }
  }

  async withdrawToBank(providerId, amount) {
    try {
      const provider = await Provider.findById(providerId);
      if (!provider) {
        throw new Error("Provider not found");
      }

      if (Number(provider.completedJobs || 0) < 1) {
        throw new Error(
          "You must complete at least one booking before you can withdraw funds.",
        );
      }

      const withdrawalAmount = Number(amount);
      if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
        throw new Error("Valid withdrawal amount is required");
      }

      if (withdrawalAmount > this.MAX_BANK_WITHDRAWAL_AMOUNT) {
        throw new Error(
          `Withdrawal is limited to NGN${this.MAX_BANK_WITHDRAWAL_AMOUNT.toLocaleString()} per request`,
        );
      }

      const wallet = await WalletService.getOrCreateWallet(providerId, "Provider");
      if (wallet.balance.available < withdrawalAmount) {
        throw new Error(
          `Insufficient wallet balance. Required: NGN${withdrawalAmount.toLocaleString()}, Available: NGN${wallet.balance.available.toLocaleString()}`,
        );
      }

      // Check if provider has recipient code
      let recipientCode = provider.paystackRecipientCode;
      if (!recipientCode) {
        recipientCode = await this.createTransferRecipient(provider);
      }

      // Initiate Paystack transfer
      const transferResponse = await axios.post(
        `${this.paystackBaseURL}/transfer`,
        {
          source: "balance",
          amount: withdrawalAmount * 100,
          recipient: recipientCode,
          reason: `Wallet withdrawal`,
          reference: this.generateReference("WTH"),
          currency: "NGN",
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!transferResponse.data.status) {
        throw new Error("Failed to initiate transfer");
      }

      const balanceBefore = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      await wallet.debit(withdrawalAmount);

      const balanceAfter = {
        available: wallet.balance.available,
        pending: wallet.balance.pending,
        total: wallet.balance.total,
      };

      const payoutTransaction = await Transaction.create({
        reference: transferResponse.data.data.reference,
        type: "withdrawal",
        from: {
          userId: provider._id,
          userModel: "Provider",
          walletId: wallet._id,
        },
        amount: withdrawalAmount,
        balances: {
          before: balanceBefore,
          after: balanceAfter,
        },
        bankDetails: {
          accountNumber: provider.accountNumber,
          accountName: provider.accountName,
          bankCode: provider.bankCode,
          bankName: provider.bankName,
        },
        gateway: {
          name: "paystack",
          reference: transferResponse.data.data.reference,
          response: transferResponse.data.data,
        },
        status: "completed",
        description: "Wallet withdrawal to bank",
        completedAt: new Date(),
      });

      return {
        success: true,
        message: "Withdrawal initiated",
        amount: withdrawalAmount,
        reference: transferResponse.data.data.reference,
        transaction: payoutTransaction,
      };
    } catch (error) {
      console.error("Withdraw to bank error:", error);
      throw error;
    }
  }
  /**
   * Create transfer recipient for provider
   */

  async createTransferRecipient(provider) {
    try {
      if (!provider.accountName || !provider.bankCode) {
        throw new Error(
          "Provider bank details not found. Please update your bank information.",
        );
      }

      console.log("bank", provider.accountName);

      const response = await axios.post(
        `${this.paystackBaseURL}/transferrecipient`,
        {
          type: "nuban",
          name:
            provider.accountName ||
            `${provider.userId.firstName} ${provider.userId.lastName}`,
          account_number: provider.accountNumber,
          bank_code: provider.bankCode,
          currency: "NGN",
          metadata: {
            providerId: provider._id.toString(),
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.data.status) {
        throw new Error("Failed to create transfer recipient");
      }

      const recipientCode = response.data.data.recipient_code;

      // Save recipient code to provider
      await Provider.findByIdAndUpdate(provider._id, {
        paystackRecipientCode: recipientCode,
      });

      return recipientCode;
    } catch (error) {
      console.error("Create transfer recipient error:", error);
      throw error;
    }
  }

  /**
    * Handle Paystack webhook events

   */

  async handleWebhook(payload, signature) {
    try {
      // Verify webhook signature
      const hash = crypto
        .createHmac("sha512", this.paystackSecretKey)
        .update(JSON.stringify(payload))
        .digest("hex");

      if (hash !== signature) {
        throw new Error("Invalid webhook signature");
      }

      const event = payload.event;
      const data = payload.data;

      console.log(`📨 Webhook received: ${event}`);

      switch (event) {
        case "charge.success":
          await this.handleChargeSuccess(data);
          break;

        case "transfer.success":
          await this.handleTransferSuccess(data);
          break;

        case "transfer.failed":
          await this.handleTransferFailed(data);
          break;

        case "refund.processed":
          await this.handleRefundProcessed(data);
          break;

        default:
          console.log(`Unhandled webhook event: ${event}`);
      }

      return { success: true };
    } catch (error) {
      console.error("Webhook handling error:", error);
      throw error;
    }
  }

  /**
   * Handle successful charge (payment received)
   */
  async handleChargeSuccess(data) {
    try {
      const reference = data.reference;
      const bookingId = data.metadata?.bookingId;

      if (!bookingId) {
        console.log("No booking ID in webhook data");
        return;
      }

      await Transaction.findOneAndUpdate(
        { reference, type: "payment" },
        {
          status: "completed",
          "gateway.response": data,
          completedAt: new Date(),
        },
      );

      // This is redundant with verifyPayment, but good for backup
      await Booking.findByIdAndUpdate(bookingId, {
        status: "paid_escrow",
        "payment.escrowStatus": "held",
        "payment.paidAt": new Date(),
      });

      console.log(`✅ Payment confirmed for booking ${bookingId}`);
    } catch (error) {
      console.error("Handle charge success error:", error);
    }
  }

  /**
   * Handle successful transfer (payout to provider)
   */
  async handleTransferSuccess(data) {
    try {
      const reference = data.reference;

      const transaction = await Transaction.findOneAndUpdate(
        { reference, type: "payout" },
        {
          status: "completed",
          "gateway.response": data,
          completedAt: new Date(),
        },
        { new: true },
      );

      if (transaction && transaction.to.userId) {
        await notificationService.notifyProvider(transaction.to.userId, {
          type: "transfer_success",
          title: "✅ Payment Received",
          message: `₦${transaction.amount.toLocaleString()} has been deposited to your account`,
          bookingId: transaction.bookingId,
        });
      }

      console.log(`✅ Transfer successful: ${reference}`);
    } catch (error) {
      console.error("Handle transfer success error:", error);
    }
  }

  /**
   * Handle failed transfer
   */
  async handleTransferFailed(data) {
    try {
      const reference = data.reference;

      const transaction = await Transaction.findOneAndUpdate(
        { reference, type: "payout" },
        {
          status: "failed",
          "gateway.response": data,
          "error.message": data.reason || "Transfer failed",
          failedAt: new Date(),
        },
        { new: true },
      );

      // Revert booking escrow status
      if (transaction && transaction.bookingId) {
        await Booking.findByIdAndUpdate(transaction.bookingId, {
          "payment.escrowStatus": "held", // Keep in escrow
          status: "completed", // Revert to completed
        });
      }

      console.log(`❌ Transfer failed: ${reference}`);
    } catch (error) {
      console.error("Handle transfer failed error:", error);
    }
  }
  /**
   * Handle refund processed
   */
  async handleRefundProcessed(data) {
    try {
      const reference = data.reference;

      await Transaction.findOneAndUpdate(
        { reference, type: "refund" },
        {
          status: "completed",
          "gateway.response": data,
          completedAt: new Date(),
        },
      );

      console.log(`✅ Refund processed: ${reference}`);
    } catch (error) {
      console.error("Handle refund processed error:", error);
    }
  }

  /**
   * Generate unique payment reference
   */
  generateReference(prefix = "PAY") {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Get list of Nigerian banks
   */
  async getBanks() {
    try {
      const response = await axios.get(
        `${this.paystackBaseURL}/bank?currency=NGN`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      return response.data.data;
    } catch (error) {
      console.error("Get banks error:", error);
      throw error;
    }
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount({ accountNumber, bankCode }) {
    // Destructure the object
    try {
      const response = await axios.get(
        `${this.paystackBaseURL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecretKey}`,
          },
        },
      );

      if (!response.data.status) {
        throw new Error("Bank account verification failed");
      }

      return {
        accountName: response.data.data.account_name,
        accountNumber: response.data.data.account_number,
        bankCode,
      };
    } catch (error) {
      console.error("Verify bank account error:", error);
      throw error;
    }
  }
}

module.exports = new paymentService();
