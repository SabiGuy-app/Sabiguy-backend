const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true, select: false },
    fullName: { type: String, required: true },
    role: { type: String, enum: ["admin"], default: "admin" },
   emailVerified: { type: Boolean, default: false },

  },
  { timestamps: true },
);

module.exports = mongoose.model("Admin", adminSchema);
