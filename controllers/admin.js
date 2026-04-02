const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Provider = require("../models/ServiceProvider");
const Buyer = require("../models/ServiceUser");
const Booking = require("../models/Bookings");

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "20h";

class AdminController {
  getUserModel(userType) {
    if (userType === "buyer") return Buyer;
    if (userType === "provider") return Provider;
    if (userType === "admin") return Admin;
    return null;
  }
  async createAdmin(req, res) {
    try {
      const { email, password, fullName } = req.body || {};

      if (!email || !password || !fullName) {
        return res.status(400).json({
          message: "Email, password, and fullName are required",
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      const existing = await Admin.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(400).json({ message: "Admin already exists" });
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

      const normalizedEmail = String(email).trim().toLowerCase();

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
