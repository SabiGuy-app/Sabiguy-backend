const mongoose = require("mongoose");

const updatePolicySchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: true, required: true },
    platform: { type: String, enum: ["ios", "android", "both"], required: true },
    update_type: {
      type: String,
      enum: ["none", "soft_store_update", "force_store_update"],
      required: true,
    },
    trigger_timing: {
      type: String,
      enum: ["app_launch", "after_login", "on_home_screen"],
      required: true,
    },
    minimum_required_version: { type: String, default: "0.0.0", required: true },
    latest_version: { type: String, default: "0.0.0", required: true },
    title: { type: String, default: "" },
    message: { type: String, default: "" },
    ios_store_url: { type: String, default: "" },
    android_store_url: { type: String, default: "" },
    allow_dismiss: { type: Boolean, default: true, required: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } },
);

updatePolicySchema.index({ platform: 1, trigger_timing: 1 }, { unique: true });

module.exports = mongoose.model("MobileUpdatePolicy", updatePolicySchema);
