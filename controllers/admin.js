const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const Provider = require("../models/ServiceProvider");

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "20h";

class AdminController {
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

      const adminCount = await Admin.countDocuments();
      if (adminCount > 0) {
        const authHeader = req.headers.authorization || "";
        if (!authHeader.startsWith("Bearer ")) {
          return res.status(403).json({ message: "Admin access required" });
        }

        const token = authHeader.split(" ")[1];
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
          return res.status(403).json({ message: "Admin access required" });
        }

        if (decoded?.role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }

        const admin = await Admin.findById(decoded.id);
        if (!admin) {
          return res.status(403).json({ message: "Admin access required" });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const admin = await Admin.create({
        email: normalizedEmail,
        password: hashedPassword,
        fullName,
        role: "admin",
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
}

module.exports = new AdminController();
