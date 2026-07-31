const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("./Admin.model");
const Provider = require("../../../models/ServiceProvider");
const Buyer = require("../../../models/ServiceUser");
const Booking = require("../bookings/Bookings.model");
const Transaction = require("../../../models/Transaction");
const WalletService = require("../wallet/wallet.service");
const notificationService = require("../../services/notification.service");
const paymentService = require("../payment/payment.service");
const {
  findUserByEmailAcrossDb,
  normalizeEmail,
} = require("../../services/identity.service");
const {
  sendWelcomeEmail,
  sendKycVerificationEmail,
  sendKycDisputeEmail,
} = require("../../config/emailVerification");

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "20h";
const STALE_LOCATION_MINUTES = Number(process.env.STALE_LOCATION_MINUTES || 10);

class AdminController {
  constructor() {
    this.deactivateUser = this.deactivateUser.bind(this);
    this.deleteUser = this.deleteUser.bind(this);
    this.getPlatformFeeReport = this.getPlatformFeeReport.bind(this);
    this.getPlatformBalance = this.getPlatformBalance.bind(this);
  }

  getUserModel(userType) {
    if (userType === "buyer") return Buyer;
    if (userType === "provider") return Provider;
    if (userType === "admin") return Admin;
    return null;
  }

  buildFeeBreakdown(booking = {}) {
    const pricingBreakdown = booking.pricingBreakdown || {};
    const subtotal = Number(
      pricingBreakdown.subtotal ??
        booking.agreedPrice ??
        booking.totalAmount ??
        booking.budget ??
        0,
    );
    const riderPays = Number(
      pricingBreakdown.riderPaysFinal ??
        booking.calculatedPrice ??
        booking.totalAmount ??
        0,
    );
    const userPlatformFee = Number(
      pricingBreakdown.platformFee ?? booking.serviceFee ?? 0,
    );
    const providerCommissionRaw = Number(
      pricingBreakdown.driverCommission ?? booking.providerCommission ?? 0,
    );
    const totalPlatformFee = Number(
      pricingBreakdown.platformEarns ?? booking.platformEarns ?? 0,
    );
    const providerCommission =
      providerCommissionRaw || Math.max(totalPlatformFee - userPlatformFee, 0);
    const providerReceives = Number(
      pricingBreakdown.driverReceives ??
        booking.driverReceives ??
        booking.providerReceives ??
        Math.max(subtotal - providerCommission, 0),
    );
    const taxCollected = Number(pricingBreakdown.tax ?? 0);

    return {
      subtotal,
      riderPays,
      userPlatformFee,
      providerCommission,
      providerReceives,
      totalPlatformFee,
      taxCollected,
    };
  }

  async getPlatformFeeStats(match = {}) {
    const bookings = await Booking.find(match)
      .select(
        "pricingBreakdown agreedPrice totalAmount budget calculatedPrice serviceFee providerCommission driverReceives providerReceives platformEarns",
      )
      .lean();

    return bookings.reduce(
      (acc, booking) => {
        const breakdown = this.buildFeeBreakdown(booking);

        acc.totalBookings += 1;
        acc.totalSubtotal += breakdown.subtotal;
        acc.totalRiderPays += breakdown.riderPays;
        acc.totalUserPlatformFee += breakdown.userPlatformFee;
        acc.totalProviderCommission += breakdown.providerCommission;
        acc.totalProviderReceives += breakdown.providerReceives;
        acc.totalPlatformFee += breakdown.totalPlatformFee;
        acc.totalTaxCollected += breakdown.taxCollected;

        return acc;
      },
      {
        totalBookings: 0,
        totalSubtotal: 0,
        totalRiderPays: 0,
        totalUserPlatformFee: 0,
        totalProviderCommission: 0,
        totalProviderReceives: 0,
        totalPlatformFee: 0,
        totalTaxCollected: 0,
      },
    );
  }

  async createAdmin(req, res) {
    try {
      const { email, password, fullName } = req.body || {};

      if (!email || !password || !fullName) {
        return res.status(400).json({
          message: "Email, password, and fullName are required",
        });
      }

      const normalizedEmail = normalizeEmail(email);

      const existing = await findUserByEmailAcrossDb(normalizedEmail);
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }

      // const adminCount = await Admin.countDocuments();
      // if (adminCount > 0) {
      //   const authHeader = req.headers.authorization || "";
      //   if (!authHeader.startsWith("Bearer ")) {
      //     return res.status(403).json({ message: "Admin access required" });
      //   }

      //   const token = authHeader.split(" ")[1];
      //   let decoded;
      //   try {
      //     decoded = jwt.verify(token, process.env.JWT_SECRET);
      //   } catch {
      //     return res.status(403).json({ message: "Admin access required" });
      //   }

      //   if (decoded?.role !== "admin") {
      //     return res.status(403).json({ message: "Admin access required" });
      //   }

      //   const admin = await Admin.findById(decoded.id);
      //   if (!admin) {
      //     return res.status(403).json({ message: "Admin access required" });
      //   }
      // }

      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = await Admin.create({
        email: normalizedEmail,
        password: hashedPassword,
        fullName,
        role: "admin",
        emailVerified: true,
      });

      const token = jwt.sign(
        { id: admin._id, role: "admin", email: admin.email },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
      );

      return res.status(201).json({
        success: true,
        message: "Admin created successfully",
        data: {
          id: admin._id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
          token,
        },
      });
    } catch (error) {
      console.error("Create admin error:", error);
      return res.status(500).json({
        success: false,
        message: "Error creating admin",
        error: error.message,
      });
    }
  }

  async loginAdmin(req, res) {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({
          message: "Email and password are required",
        });
      }

      const normalizedEmail = normalizeEmail(email);

      const admin = await Admin.findOne({ email: normalizedEmail }).select(
        "+password",
      );
      if (!admin) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      if (admin.emailVerified === false) {
        return res
          .status(403)
          .json({ message: "Please verify your email before logging in" });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: admin._id, role: "admin", email: admin.email },
        process.env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
      );

      return res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          id: admin._id,
          email: admin.email,
          fullName: admin.fullName,
          role: admin.role,
          token,
        },
      });
    } catch (error) {
      console.error("Admin login error:", error);
      return res.status(500).json({
        success: false,
        message: "Error logging in",
        error: error.message,
      });
    }
  }

  async verifyKyc(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { providerId } = req.params;
      const { note } = req.body || {};

      if (!providerId) {
        return res.status(400).json({ message: "providerId is required" });
      }

      const admin = await Admin.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const provider = await Provider.findById(providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      provider.kycVerified = true;
      provider.kycVerifiedAt = new Date();
      provider.kycVerifiedBy = {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
      };
      if (note) provider.kycVerificationNote = note;

      await provider.save();

      // Send KYC verification confirmation email
      try {
        await sendKycVerificationEmail(provider.email, {
          providerName: provider.fullName || "Service Provider",
          note: note || "",
        });
      } catch (emailError) {
        console.error("Failed to send KYC verification email:", emailError);
        // Don't fail the request if email sending fails
      }

      return res.status(200).json({
        success: true,
        message: "KYC verified successfully",
        data: {
          providerId: provider._id,
          kycVerified: provider.kycVerified,
          kycVerifiedAt: provider.kycVerifiedAt,
          kycVerifiedBy: provider.kycVerifiedBy,
          kycVerificationNote: provider.kycVerificationNote,
        },
      });
    } catch (error) {
      console.error("Verify KYC error:", error);
      return res.status(500).json({
        success: false,
        message: "Error verifying KYC",
        error: error.message,
      });
    }
  }

  async deleteBooking(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { bookingId } = req.params;

      if (!bookingId) {
        return res.status(400).json({ message: "bookingId is required" });
      }

      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }

      await booking.deleteOne();

      return res.status(200).json({
        success: true,
        message: "Booking deleted successfully",
      });
    } catch (error) {
      console.error("Delete booking error:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting booking",
        error: error.message,
      });
    }
  }

  async verifyBuyerKyc(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { buyerId } = req.params;
      const { note } = req.body || {};

      if (!buyerId) {
        return res.status(400).json({ message: "buyerId is required" });
      }

      const admin = await Admin.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const buyer = await Buyer.findById(buyerId);
      if (!buyer) {
        return res.status(404).json({ message: "Buyer not found" });
      }

      buyer.kycCompleted = true;
      buyer.kycVerified = true;
      buyer.kycVerifiedAt = new Date();
      buyer.kycVerifiedBy = {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
      };
      buyer.kycRejected = false;
      buyer.kycRejectedAt = null;
      buyer.kycRejectedBy = undefined;
      buyer.kycRejectionReason = undefined;
      buyer.kycRejectionNote = undefined;
      buyer.kycLevel = Math.max(buyer.kycLevel || 0, 2);
      if (note) buyer.kycVerificationNote = note;

      await buyer.save();

      let welcomeEmailSent = Boolean(buyer.email);
      if (buyer.email) {
        try {
          const firstName = buyer.fullName
            ? buyer.fullName.trim().split(/\s+/)[0]
            : "there";
          const baseUrl = process.env.FRONTEND_URL || "";

          await sendWelcomeEmail(buyer.email, {
            firstName,
            year: new Date().getFullYear(),
            appUrl: baseUrl,
            ctaText: "Explore SabiGuy",
            role: "buyer",
          });
        } catch (emailError) {
          console.error("Failed to send buyer KYC approval email:", emailError);
          welcomeEmailSent = false;
        }
      }

      return res.status(200).json({
        success: true,
        message: welcomeEmailSent
          ? "Buyer KYC verified successfully"
          : "Buyer KYC verified successfully. Welcome email will be sent shortly.",
        data: {
          buyerId: buyer._id,
          kycCompleted: buyer.kycCompleted,
          kycVerified: buyer.kycVerified,
          kycVerifiedAt: buyer.kycVerifiedAt,
          kycVerifiedBy: buyer.kycVerifiedBy,
          kycVerificationNote: buyer.kycVerificationNote,
          kycLevel: buyer.kycLevel,
        },
      });
    } catch (error) {
      console.error("Verify buyer KYC error:", error);
      return res.status(500).json({
        success: false,
        message: "Error verifying buyer KYC",
        error: error.message,
      });
    }
  }

  async verifyPayment(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { bookingId } = req.params;
      const { note, reference, force } = req.body || {};
      const referenceFromQuery = req.query?.reference;

      if (!bookingId) {
        return res.status(400).json({ message: "bookingId is required" });
      }

      const admin = await Admin.findById(req.user.id).select(
        "email fullName role",
      );
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      let paymentReference = reference || referenceFromQuery;
      let booking = null;

      if (bookingId) {
        booking = await Booking.findById(bookingId).select(
          "_id payment status userId providerId totalAmount serviceType",
        );
        if (!booking) {
          return res.status(404).json({ message: "Booking not found" });
        }
      }

      let bookingToUpdate = booking;

      if (!paymentReference) {
        paymentReference =
          booking?.payment?.paystackRef ||
          (
            await Transaction.findOne({
              bookingId: booking?._id,
              type: "payment",
            }).select("reference")
          )?.reference;
      }

      if (!paymentReference) {
        return res.status(404).json({
          message:
            "Payment reference not found. Provide a bookingId or a Paystack reference.",
        });
      }

      let result;
      try {
        result = await paymentService.verifyPayment(paymentReference);
      } catch (verifyError) {
        const paystackErrorCode = verifyError?.response?.data?.code;
        const paystackMessage =
          verifyError?.response?.data?.message || verifyError.message;

        if (force === true || force === "true") {
          const transaction =
            (await Transaction.findOne({
              bookingId: bookingToUpdate?._id || booking?._id,
              type: "payment",
              reference: paymentReference,
            })) ||
            (await Transaction.findOne({
              bookingId: bookingToUpdate?._id || booking?._id,
              type: "payment",
            }));

          const transactionUpdate = {
            status: "completed",
            gateway: {
              name: "paystack",
              reference: paymentReference,
              response: {
                manualOverride: true,
                verifiedBy: {
                  id: admin._id,
                  email: admin.email,
                  fullName: admin.fullName,
                },
                verifiedAt: new Date(),
                note:
                  note ||
                  "Manually verified by admin after dashboard confirmation",
                paystackMessage,
                paystackErrorCode,
                reference: paymentReference,
              },
            },
            completedAt: new Date(),
          };

          let updatedTransaction = transaction;
          if (updatedTransaction) {
            updatedTransaction = await Transaction.findByIdAndUpdate(
              updatedTransaction._id,
              transactionUpdate,
              { new: true },
            );
          } else {
            updatedTransaction = await Transaction.create({
              reference: paymentReference,
              type: "payment",
              from: {
                userId: booking.userId,
                userModel: "Buyer",
              },
              to: {
                userId: booking.providerId,
                userModel: "Provider",
              },
              amount: booking.payment?.escrowAmount || booking.totalAmount || 0,
              bookingId: bookingToUpdate?._id || booking._id,
              gateway: transactionUpdate.gateway,
              status: "completed",
              description: `Manual payment verification for booking #${
                bookingToUpdate?._id || booking._id
              }`,
              completedAt: new Date(),
            });
          }

          result = {
            success: true,
            message:
              "Payment manually verified by admin after Paystack dashboard confirmation",
            booking: bookingToUpdate || booking,
            transaction: updatedTransaction,
            manualOverride: true,
          };
        } else if (paystackErrorCode === "transaction_not_found") {
          return res.status(422).json({
            success: false,
            message:
              "Paystack could not find this transaction reference. Confirm the exact reference in the Paystack dashboard, or resend the request with force=true after manual confirmation.",
            error: paystackMessage,
            code: paystackErrorCode,
          });
        } else {
          throw verifyError;
        }
      }

      if (!bookingToUpdate) {
        bookingToUpdate = await Booking.findOne({
          "payment.paystackRef": paymentReference,
        }).select("_id");
      }

      if (!bookingToUpdate) {
        return res.status(404).json({
          message: "Booking not found for this payment reference",
        });
      }

      const updatedBooking = await Booking.findByIdAndUpdate(
        bookingToUpdate._id,
        {
          $set: {
            "payment.verifiedAt": new Date(),
            "payment.verifiedBy": {
              id: admin._id,
              email: admin.email,
              fullName: admin.fullName,
            },
            "payment.verificationMethod": "admin_manual",
            "payment.verificationNote": note || null,
          },
        },
        { new: true },
      )
        .populate("userId", "fullName email")
        .populate("providerId");

      return res.status(200).json({
        success: true,
        message: result.message || "Payment verified successfully",
        data: {
          booking: updatedBooking,
          transaction: result.transaction,
          manualOverride: result.manualOverride || false,
          verifiedBy: {
            id: admin._id,
            email: admin.email,
            fullName: admin.fullName,
          },
        },
      });
    } catch (error) {
      console.error("Admin payment verify error:", error);
      return res.status(500).json({
        success: false,
        message: "Error verifying payment",
        error: error.message,
      });
    }
  }

  async disputeKyc(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { providerId } = req.params;
      const { reason, note } = req.body || {};

      if (!providerId) {
        return res.status(400).json({ message: "providerId is required" });
      }

      if (!reason) {
        return res.status(400).json({ message: "reason is required" });
      }

      const admin = await Admin.findById(req.user.id);
      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      const provider = await Provider.findById(providerId);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      // Mark KYC as rejected/disputed
      provider.kycVerified = false;
      provider.kycRejected = true;
      provider.kycRejectedAt = new Date();
      provider.kycRejectedBy = {
        id: admin._id,
        email: admin.email,
        fullName: admin.fullName,
      };
      provider.kycRejectionReason = reason;
      if (note) provider.kycRejectionNote = note;

      await provider.save();

      // Send KYC dispute/rejection email
      try {
        await sendKycDisputeEmail(provider.email, {
          providerName: provider.fullName || "Service Provider",
          reason: reason,
          note: note || "",
        });
      } catch (emailError) {
        console.error("Failed to send KYC dispute email:", emailError);
        // Don't fail the request if email sending fails
      }

      return res.status(200).json({
        success: true,
        message: "KYC disputed successfully",
        data: {
          providerId: provider._id,
          kycVerified: provider.kycVerified,
          kycRejected: provider.kycRejected,
          kycRejectedAt: provider.kycRejectedAt,
          kycRejectedBy: provider.kycRejectedBy,
          kycRejectionReason: provider.kycRejectionReason,
          kycRejectionNote: provider.kycRejectionNote,
        },
      });
    } catch (error) {
      console.error("Dispute KYC error:", error);
      return res.status(500).json({
        success: false,
        message: "Error disputing KYC",
        error: error.message,
      });
    }
  }

  async getOnlineProviders(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
      const safeLimit = Math.min(limit, 100);
      const skip = (page - 1) * safeLimit;

      const staleThreshold = new Date(
        Date.now() - STALE_LOCATION_MINUTES * 60 * 1000,
      );

      const query = {
        isActive: true,
        isDeleted: { $ne: true },
        currentLocation: {
          $exists: true,
          $ne: null,
        },
        "currentLocation.coordinates": { $exists: true, $ne: [] },
        lastLocationUpdate: { $gte: staleThreshold },
      };

      const [providers, total] = await Promise.all([
        Provider.find(query)
          .select(
            "fullName profilePicture phoneNumber email job service rating completedJobs availability currentLocation lastLocationUpdate city address kycVerified",
          )
          .sort({ lastLocationUpdate: -1, createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        Provider.countDocuments(query),
      ]);

      const data = providers.map((provider) => {
        const lastLocationUpdate = provider.lastLocationUpdate
          ? new Date(provider.lastLocationUpdate)
          : null;

        return {
          ...provider,
          online: true,
          locationFresh: true,
          locationAgeMinutes: lastLocationUpdate
            ? Math.max(
                0,
                Math.round((Date.now() - lastLocationUpdate.getTime()) / 60000),
              )
            : null,
        };
      });

      return res.status(200).json({
        success: true,
        count: data.length,
        total,
        page,
        totalPages: Math.ceil(total / safeLimit) || 1,
        data,
      });
    } catch (error) {
      console.error("Get online providers error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching online providers",
        error: error.message,
      });
    }
  }

  async getOnlineBuyers(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
      const safeLimit = Math.min(limit, 100);
      const skip = (page - 1) * safeLimit;

      const staleThreshold = new Date(
        Date.now() - STALE_LOCATION_MINUTES * 60 * 1000,
      );

      const query = {
        isActive: true,
        isDeleted: { $ne: true },
        currentLocation: {
          $exists: true,
          $ne: null,
        },
        "currentLocation.coordinates": { $exists: true, $ne: [] },
        lastLocationUpdate: { $gte: staleThreshold },
      };

      const [buyers, total] = await Promise.all([
        Buyer.find(query)
          .select(
            "fullName profilePicture phoneNumber email job service rating completedJobs availability currentLocation lastLocationUpdate city address kycVerified",
          )
          .sort({ lastLocationUpdate: -1, createdAt: -1 })
          .skip(skip)
          .limit(safeLimit)
          .lean(),
        Buyer.countDocuments(query),
      ]);

      const data = buyers.map((buyer) => {
        const lastLocationUpdate = buyer.lastLocationUpdate
          ? new Date(buyer.lastLocationUpdate)
          : null;

        return {
          ...buyer,
          online: true,
          locationFresh: true,
          locationAgeMinutes: lastLocationUpdate
            ? Math.max(
                0,
                Math.round((Date.now() - lastLocationUpdate.getTime()) / 60000),
              )
            : null,
        };
      });

      return res.status(200).json({
        success: true,
        count: data.length,
        total,
        page,
        totalPages: Math.ceil(total / safeLimit) || 1,
        data,
      });
    } catch (error) {
      console.error("Get online providers error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching online providers",
        error: error.message,
      });
    }
  }

  async getDashboardStats(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const activeStatuses = [
        "pending_providers",
        "awaiting_provider_acceptance",
        "provider_selected",
        "payment_pending",
        "paid_escrow",
        "in_progress",
        "arrived_at_pickup",
        "enroute_to_dropoff",
        "arrived_at_dropoff",
      ];
      const completedStatuses = ["completed", "funds_released"];

      const [
        totalBuyers,
        totalProviders,
        totalAdmins,
        totalBookings,
        activeBookings,
        completedBookings,
        cancelledBookings,
        pendingKycProviders,
        verifiedKycProviders,
        bookingsByStatus,
        revenueOverview,
      ] = await Promise.all([
        Buyer.countDocuments({}),
        Provider.countDocuments({}),
        Admin.countDocuments({}),
        Booking.countDocuments({}),
        Booking.countDocuments({ status: { $in: activeStatuses } }),
        Booking.countDocuments({ status: { $in: completedStatuses } }),
        Booking.countDocuments({ status: "cancelled" }),
        Provider.countDocuments({ kycCompleted: true, kycVerified: false }),
        Provider.countDocuments({ kycVerified: true }),
        Booking.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        Booking.aggregate([
          {
            $match: {
              status: { $in: completedStatuses },
            },
          },
          {
            $project: {
              createdAt: 1,
              platformEarns: { $ifNull: ["$platformEarns", 0] },
            },
          },
          {
            $facet: {
              total: [
                { $group: { _id: null, amount: { $sum: "$platformEarns" } } },
              ],
              last7Days: [
                { $match: { createdAt: { $gte: sevenDaysAgo } } },
                { $group: { _id: null, amount: { $sum: "$platformEarns" } } },
              ],
              last30Days: [
                { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                { $group: { _id: null, amount: { $sum: "$platformEarns" } } },
              ],
            },
          },
        ]),
      ]);

      const revenueFacet = revenueOverview?.[0] || {};
      const totalRevenue = revenueFacet.total?.[0]?.amount || 0;
      const last7DaysRevenue = revenueFacet.last7Days?.[0]?.amount || 0;
      const last30DaysRevenue = revenueFacet.last30Days?.[0]?.amount || 0;

      return res.status(200).json({
        success: true,
        data: {
          users: {
            total: totalBuyers + totalProviders,
            buyers: totalBuyers,
            providers: totalProviders,
            admins: totalAdmins,
          },
          bookings: {
            total: totalBookings,
            active: activeBookings,
            completed: completedBookings,
            cancelled: cancelledBookings,
            byStatus: bookingsByStatus.map((item) => ({
              status: item._id,
              count: item.count,
            })),
          },
          kyc: {
            pending: pendingKycProviders,
            verified: verifiedKycProviders,
          },
          revenue: {
            total: totalRevenue,
            last7Days: last7DaysRevenue,
            last30Days: last30DaysRevenue,
          },
        },
      });
    } catch (error) {
      console.error("Admin dashboard stats error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching dashboard statistics",
        error: error.message,
      });
    }
  }

  async getPlatformFeeReport(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { page = 1, limit = 20, status } = req.query;
      const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const skip = (pageNumber - 1) * pageSize;

      const match = {};
      if (status) {
        match.status = status;
      }

      const [result] = await Booking.aggregate([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: pageSize },
              {
                $lookup: {
                  from: "buyers",
                  localField: "userId",
                  foreignField: "_id",
                  as: "user",
                },
              },
              {
                $lookup: {
                  from: "providers",
                  localField: "providerId",
                  foreignField: "_id",
                  as: "provider",
                },
              },
              {
                $addFields: {
                  user: { $arrayElemAt: ["$user", 0] },
                  provider: { $arrayElemAt: ["$provider", 0] },
                },
              },
              {
                $project: {
                  _id: 1,
                  bookingId: "$_id",
                  reference: 1,
                  serviceType: 1,
                  subCategory: 1,
                  status: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  user: {
                    _id: "$user._id",
                    fullName: "$user.fullName",
                    email: "$user.email",
                    phoneNumber: "$user.phoneNumber",
                  },
                  provider: {
                    _id: "$provider._id",
                    fullName: "$provider.fullName",
                    email: "$provider.email",
                    phoneNumber: "$provider.phoneNumber",
                  },
                  feeBreakdown: {
                    subtotal: {
                      $ifNull: [
                        "$pricingBreakdown.subtotal",
                        {
                          $ifNull: [
                            "$agreedPrice",
                            { $ifNull: ["$totalAmount", "$budget"] },
                          ],
                        },
                      ],
                    },
                    riderPays: {
                      $ifNull: [
                        "$pricingBreakdown.riderPaysFinal",
                        { $ifNull: ["$calculatedPrice", "$totalAmount"] },
                      ],
                    },
                    userPlatformFee: {
                      $ifNull: ["$pricingBreakdown.platformFee", "$serviceFee"],
                    },
                    providerCommission: {
                      $ifNull: [
                        "$pricingBreakdown.driverCommission",
                        "$providerCommission",
                      ],
                    },
                    providerReceives: {
                      $ifNull: [
                        "$pricingBreakdown.driverReceives",
                        { $ifNull: ["$driverReceives", "$providerReceives"] },
                      ],
                    },
                    totalPlatformFee: {
                      $ifNull: [
                        "$pricingBreakdown.platformEarns",
                        "$platformEarns",
                      ],
                    },
                  },
                  payment: 1,
                  pricingBreakdown: 1,
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
      ]);

      const rows = (result?.data || []).map((row) => ({
        ...row,
        feeBreakdown: this.buildFeeBreakdown(row),
      }));
      const total = result?.total?.[0]?.count || 0;
      const summary = await this.getPlatformFeeStats(match);

      return res.status(200).json({
        success: true,
        data: rows,
        summary,
        pagination: {
          total,
          totalPages: Math.ceil(total / pageSize) || 1,
          currentPage: pageNumber,
          perPage: pageSize,
        },
      });
    } catch (error) {
      console.error("Platform fee report error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching platform fee report",
        error: error.message,
      });
    }
  }

  async getPlatformBalance(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const summary = await this.getPlatformFeeStats();
      const balance = {
        available: summary.totalPlatformFee,
        pending: 0,
        total: summary.totalPlatformFee,
        platformFeeCollected: summary.totalUserPlatformFee,
        providerCommissionCollected: summary.totalProviderCommission,
        totalPlatformFeeCollected: summary.totalPlatformFee,
        taxCollected: summary.totalTaxCollected,
        totalCollectedIncludingTax:
          summary.totalPlatformFee + summary.totalTaxCollected,
      };

      return res.status(200).json({
        success: true,
        data: {
          balance,
          revenue: {
            platformFeeCollected: summary.totalUserPlatformFee,
            providerCommissionCollected: summary.totalProviderCommission,
            totalPlatformFeeCollected: summary.totalPlatformFee,
            taxCollected: summary.totalTaxCollected,
            totalCollectedIncludingTax:
              summary.totalPlatformFee + summary.totalTaxCollected,
          },
          source: "platform-fee-report",
        },
      });
    } catch (error) {
      console.error("Platform balance error:", error);
      return res.status(500).json({
        success: false,
        message: "Error fetching platform balance",
        error: error.message,
      });
    }
  }

  async deactivateUser(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userType, userId } = req.params;
      const { isActive } = req.body || {};
      const Model = this.getUserModel(userType);

      if (!Model) {
        return res.status(400).json({ message: "Invalid userType" });
      }

      const user = await Model.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const nextIsActive = isActive === undefined ? false : !!isActive;
      user.isActive = nextIsActive;
      user.deactivatedAt = nextIsActive ? null : new Date();
      await user.save();

      return res.status(200).json({
        success: true,
        message: nextIsActive ? "User activated" : "User deactivated",
        data: {
          id: user._id,
          userType,
          isActive: user.isActive,
          deactivatedAt: user.deactivatedAt,
        },
      });
    } catch (error) {
      console.error("Deactivate user error:", error);
      return res.status(500).json({
        success: false,
        message: "Error updating user status",
        error: error.message,
      });
    }
  }

  async deleteUser(req, res) {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { userType, userId } = req.params;
      const mode = String(req.query.mode || "soft").toLowerCase();
      const Model = this.getUserModel(userType);

      if (!Model) {
        return res.status(400).json({ message: "Invalid userType" });
      }

      const user = await Model.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (mode === "hard") {
        await Model.deleteOne({ _id: userId });
        return res.status(200).json({
          success: true,
          message: "User deleted permanently",
          data: { id: userId, userType, mode: "hard" },
        });
      }

      user.isDeleted = true;
      user.deletedAt = new Date();
      if (user.isActive !== false) {
        user.isActive = false;
        user.deactivatedAt = user.deactivatedAt || new Date();
      }
      await user.save();

      return res.status(200).json({
        success: true,
        message: "User deleted",
        data: {
          id: user._id,
          userType,
          mode: "soft",
          isDeleted: user.isDeleted,
          deletedAt: user.deletedAt,
        },
      });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({
        success: false,
        message: "Error deleting user",
        error: error.message,
      });
    }
  }
}

module.exports = new AdminController();
