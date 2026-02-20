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
    this.platformFeePercentage = 10;
  }

  async initializePayment(bookingId, userId) {
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

      if (booking.status !== "provider_selected") {
        throw new Error("Booking must have a selected provider before payment");
      }

      const agreedPrice = booking.agreedPrice || booking.budget;
      const serviceFee = Math.round(
        (agreedPrice * this.platformFeePercentage) / 100,
      );
      const totalAmount = agreedPrice + serviceFee;

      // Update booking with payment details
      booking.agreedPrice = agreedPrice;
      booking.serviceFee = serviceFee;
      booking.totalAmount = totalAmount;

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
            agreedPrice,
            serviceFee,
            totalAmount,
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
        escrowAmount: agreedPrice,
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
          serviceFee,
          totalAmount,
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
          "payment.escrowAmount": transaction.agreedPrice,
        },
        { new: true },
      )
        .populate("userId", "fullName email")
        .populate("providerId", "userId");

      await WalletService.recordPayment(
        updatedTransaction.from.userId,
        updatedTransaction.to.userId,
        booking._id,
        updatedTransaction.breakdown,
        notificationService,
      );

      // Notify provider that payment is secured
      if (booking.providerId) {
        await notificationService.notifyProvider(booking.providerId._id, {
          type: "payment_received",
          title: "💰 Payment Secured",
          message: `Payment for your ${booking.serviceType} booking is now in escrow. Complete the service to receive payment.`,
          bookingId: booking._id,
        });
      }

      // Notify user
      await notificationService.notifyUser(booking.userId._id, {
        type: "payment_received",
        title: "✅ Payment Successful",
        message: `Your payment is secured. Provider can now start the service.`,
        bookingId: booking._id,
      });

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
        throw new Error("Unauthorized");
      }
      if (booking.status === "funds_released") {
        throw new Error("Payment already released from escrow");
      }
      if (booking.status !== "user_accepted_completion") {
        throw new Error(
          "Booking completion must be accepted before releasing payment",
        );
      }

      if (booking.payment.escrowStatus !== "held") {
        throw new Error("No funds in escrow for this booking");
      }

      const provider = await Provider.findById(booking.providerId._id);
      if (!provider) {
        throw new Error("Provider record missing");
      }

      const escrowTransaction = await WalletService.releaseEscrow(
        booking.providerId._id,
        booking.payment.escrowAmount,
        booking._id,
        notificationService,
      );
      console.log("✅ Escrow released to provider wallet");

      // Update booking
      booking.payment.escrowStatus = "released";
      booking.payment.releasedAt = new Date();
      booking.status = "funds_released";
      await booking.save();
      console.log("✅ Booking updated to funds_released");

      // Notify provider
      await notificationService.notifyProvider(booking.providerId._id, {
        type: "funds_released",
        title: "💰 Payment Released",
        message: `₦${booking.payment.escrowAmount.toLocaleString()} has been added to your wallet for booking #${booking._id}`,
        bookingId: booking._id,
      });

      return {
        success: true,
        message: "Payment released to provider wallet",
        amount: booking.payment.escrowAmount,
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
      console.log("provider", providerId);
      if (!provider) {
        throw new Error("Provider not found");
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
          amount: amount * 100,
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

      // Process payout (debit from wallet)
      const payoutTransaction = await WalletService.processPayout(
        providerId,
        amount,
        provider.accountNumber,
        transferResponse.data.data.reference,
      );

      return {
        success: true,
        message: "Withdrawal initiated",
        amount,
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
      };
    } catch (error) {
      console.error("Verify bank account error:", error);
      throw error;
    }
  }
}

module.exports = new paymentService();
