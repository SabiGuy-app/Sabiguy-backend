const mongoose = require("mongoose");
const paymentService = require("./payment.service");
const Buyer = require("../../../models/ServiceUser");
const Booking = require("../bookings/Bookings.model");
const discountService = require("../../services/discount.service");

class PaymentController {
  // Initialze payment

  async initializePayment(req, res) {
    try {
      const { bookingId, pickupNote } = req.body;
      const userId = req.user.id;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: "Booking ID is required",
        });
      }

      const paymentData = await paymentService.initializePayment(
        bookingId,
        userId,
        pickupNote,
      );

      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully",
        data: paymentData,
      });
    } catch (error) {
      console.error("Initialize payment error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to initialize payment",
      });
    }
  }

  /**
   * Verify payment
   */
  async verifyPayment(req, res) {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Payment reference is required",
        });
      }

      const result = await paymentService.verifyPayment(reference);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Verify payment error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Payment verification failed",
      });
    }
  }

  /**
   * Get promo eligibility for a buyer before payment
   */
  async getPromoEligibility(req, res) {
    try {
      const userId = req.user.id;
      const { bookingId } = req.query;

      const user = await Buyer.findById(userId).select(
        "firstRideDiscountUsed isNewUser fullName email",
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      let booking = null;
      let pricingBreakdown = {};

      if (bookingId) {
        if (!mongoose.Types.ObjectId.isValid(bookingId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid booking ID format",
          });
        }

        booking = await Booking.findOne({
          _id: bookingId,
          userId,
        }).select(
          "agreedPrice calculatedPrice totalAmount budget pricingBreakdown serviceFee providerCommission providerReceives platformEarns",
        );

        if (!booking) {
          return res.status(404).json({
            success: false,
            message: "Booking not found",
          });
        }

        pricingBreakdown = booking.pricingBreakdown || {
          subtotal:
            booking.agreedPrice ??
            booking.calculatedPrice ??
            booking.totalAmount ??
            booking.budget ??
            0,
          platformFee: booking.serviceFee ?? 0,
          driverCommission: booking.providerCommission ?? 0,
          driverReceives: booking.providerReceives ?? 0,
          platformEarns: booking.platformEarns ?? 0,
          riderPaysFinal:
            booking.totalAmount ??
            booking.calculatedPrice ??
            booking.agreedPrice ??
            booking.budget ??
            0,
        };
      }

      const promoPreview = discountService.previewLaunchPromoBreakdown({
        user,
        booking,
        pricingBreakdown,
      });

      return res.status(200).json({
        success: true,
        message: "Promo eligibility retrieved successfully",
        data: {
          userId: user._id,
          bookingId: booking?._id ?? null,
          promo: {
            code: promoPreview.launchPromo.code,
            percent: promoPreview.launchPromo.percent,
            eligible: promoPreview.launchPromo.eligible,
            used: promoPreview.launchPromo.used,
            remaining: promoPreview.launchPromo.remaining,
            baseAmount: promoPreview.launchPromo.baseAmount,
            estimatedDiscountAmount: promoPreview.launchPromo.baseAmount,
            isNewUser: user.isNewUser,
            canApplyAtPayment: promoPreview.launchPromo.eligible,
          },
        },
      });
    } catch (error) {
      console.error("Get promo eligibility error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve promo eligibility",
      });
    }
  }
  // Release escrow to provider

  async releaseEscrow(req, res) {
    try {
      const { bookingId } = req.body;
      const userId = req.user.id;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: "Booking ID is required",
        });
      }

      const result = await paymentService.releaseEscrow(bookingId, userId);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Release escrow error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to release payment",
      });
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(req, res) {
    try {
      const { bookingId, reason } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: "Booking ID is required",
        });
      }

      const result = await paymentService.refundPayment(bookingId, reason);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Refund payment error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to process refund",
      });
    }
  }

  async withdrawToBank(req, res) {
    try {
      const providerId = req.user.id;
      const { amount } = req.body;

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "Amount is required",
        });
      }

      const result = await paymentService.withdrawToBank(providerId, amount);

      return res.status(200).json(result);
    } catch (error) {
      console.error("Withdraw fund error", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to withdraw fund",
      });
    }
  }

  //   Handle Paystack webhook

  async handleWebhook(req, res) {
    try {
      const signature = req.headers["x-paystack-signature"];
      const payload = req.body;

      await paymentService.handleWebhook(payload, signature);

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(400).json({
        success: false,
        message: "Webhook processing failed",
      });
    }
  }

  /**
   * Get banks list
   */
  async getBanks(req, res) {
    try {
      const banks = await paymentService.getBanks();

      return res.status(200).json({
        success: true,
        data: banks,
      });
    } catch (error) {
      console.error("Get banks error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch banks",
      });
    }
  }

  /**
   * Verify bank account
   */
  async verifyBankAccount(req, res) {
    try {
      const { accountNumber, bankCode } = req.body;

      if (!accountNumber || !bankCode) {
        return res.status(400).json({
          success: false,
          message: "Account number and bank code are required",
        });
      }

      const accountDetails = await paymentService.verifyBankAccount({
        accountNumber,
        bankCode,
      });
      return res.status(200).json({
        success: true,
        data: accountDetails,
      });
    } catch (error) {
      console.error("Verify bank account error:", error);
      return res.status(500).json({
        success: false,
        message: "Bank account verification failed",
      });
    }
  }
}
module.exports = new PaymentController();
