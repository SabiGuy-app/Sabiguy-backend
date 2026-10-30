const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ["provider", "business"], required: true },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "ownerModel",
      index: true,
    },
    ownerModel: { type: String, enum: ["Provider", "Business"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    productImage: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN", uppercase: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true },
);

productSchema.index({ ownerType: 1, owner: 1, status: 1 });

module.exports = mongoose.model("Product", productSchema);
