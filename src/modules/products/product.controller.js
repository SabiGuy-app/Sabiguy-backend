const mongoose = require("mongoose");
const Product = require("./product.model");
const Provider = require("../../../models/ServiceProvider");
const Business = require("../business/business.model");
const Admin = require("../admin/Admin.model");
const { sendProductSubmittedEmail, sendProductReviewEmail } = require("../../config/emailVerification");

const ADMIN_ROLES = ["super_admin", "verification_admin"];

const createProduct = async (req, res) => {
  try {
    const { name, price, description, currency, productImage } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }
    const numericPrice = Number(price);
    if (price === undefined || !Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ success: false, message: "Price must be a non-negative number" });
    }

    const ownerType = req.user.role === "provider" ? "provider" : "business";
    const ownerModel = ownerType === "provider" ? "Provider" : "Business";
    const Owner = ownerType === "provider" ? Provider : Business;
    const owner = await Owner.findById(req.user.id).select("fullName BusinessName email");
    if (!owner) return res.status(404).json({ success: false, message: "Account not found" });

    const product = await Product.create({
      ownerType,
      owner: owner._id,
      ownerModel,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      productImage:
        typeof productImage === "string" ? productImage.trim() : undefined,
      price: numericPrice,
      currency: currency || "NGN",
      status: "pending",
    });

    const admins = await Admin.find({
      adminRole: { $in: ADMIN_ROLES }, emailVerified: true, isActive: { $ne: false },
    }).select("email").lean();
    const submissions = await Promise.allSettled(admins.map((admin) =>
      sendProductSubmittedEmail(admin.email, {
        productName: product.name,
        price: product.price,
        currency: product.currency,
        accountType: ownerType,
        accountName: owner.fullName || owner.BusinessName || "Not provided",
        accountEmail: owner.email,
        description: product.description || "Not provided",
      }),
    ));
    submissions.forEach((result, index) => {
      if (result.status === "rejected") console.error(`Product review email failed for ${admins[index].email}:`, result.reason);
    });

    return res.status(201).json({ success: true, message: "Product submitted for approval", data: product });
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ success: false, message: "Failed to submit product" });
  }
};

const getPendingProducts = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.adminRole)) {
      return res.status(403).json({ success: false, message: "Verification admin access only" });
    }
    const products = await Product.find({ status: "pending" }).populate("owner", "fullName BusinessName email").sort({ createdAt: 1 }).lean();
    return res.status(200).json({ success: true, count: products.length, data: products });
  } catch (error) {
    console.error("Get pending products error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch pending products" });
  }
};

const reviewProduct = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.adminRole)) {
      return res.status(403).json({ success: false, message: "Verification admin access only" });
    }
    const { id } = req.params;
    const { status, note } = req.body || {};
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid product ID" });
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ success: false, message: "status must be approved or rejected" });
    const product = await Product.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status, reviewNote: typeof note === "string" ? note.trim() : null, reviewedAt: new Date(), reviewedBy: req.user.id } },
      { new: true, runValidators: true },
    ).populate("owner", "email fullName BusinessName");
    if (!product) return res.status(404).json({ success: false, message: "Pending product not found" });
    if (product.owner?.email) {
      try {
        await sendProductReviewEmail(product.owner.email, {
          status: product.status,
          productName: product.name,
          price: product.price,
          currency: product.currency,
          accountName: product.owner.fullName || product.owner.BusinessName || "there",
          reviewNote: product.reviewNote,
        });
      } catch (emailError) {
        console.error("Product review result email failed:", emailError);
      }
    }
    return res.status(200).json({ success: true, message: `Product ${status}`, data: product });
  } catch (error) {
    console.error("Review product error:", error);
    return res.status(500).json({ success: false, message: "Failed to review product" });
  }
};

module.exports = { createProduct, getPendingProducts, reviewProduct };
