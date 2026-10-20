const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    fullName: { type: String, required: true },
    role: { type: String, enum: ["admin"], default: "admin" },
    adminRole: {
      type: String,
      enum: ["super_admin", "verification_admin", "operations_admin", "support_admin", "finance_admin"],
      default: "operations_admin",
    },
    emailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    invitationTokenHash: { type: String, select: false },
    invitationExpiresAt: { type: Date },

  },
  { timestamps: true },
);

module.exports = mongoose.model("Admin", adminSchema);
