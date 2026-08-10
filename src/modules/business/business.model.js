const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phoneNumber: { type: String, unique: true, sparse: true, trim: true },
    password: { type: String, required: false },
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    resetOtp: { type: String },
    isGoogleUser: { type: Boolean, default: false },
    googleId: String,
    authMethods: [{ type: String, enum: ['email', 'google'] }],
    profilePicture: { type: String, default: null },
    lastVerificationOtpSentAt: { type: Date, default: null },
    refreshToken: { type: String },
    refreshTokenExpiresAt: { type: Date },
    resetOtpExpires: { type: Date },
    lastResetOtpSentAt: { type: Date, default: null },
    emailVerificationExpires: { type: Date },
    fullName: { type: String },
    accountType: { type: String },
    BusinessName: { type: String },
    regNumber: { type: String },
    BusinessAddress: { type: String },
    cacFile: { type: String },
    ninSlip: { type: String },
    cityOfOperation: { type: String },
    vehicles: [
      {
        name: { type: String },
        plateNumber: { type: String },
        type: { type: String },
        image: { type: String },
      },
    ],
    drivers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Provider',
      },
    ],
    role: {
      type: String,
      enum: ['businessOwner'],
      default: 'businessOwner',
    },
    fcmToken: {
      type: String,
      select: false,
    },
    kycCompleted: { type: Boolean, default: false },
    kycVerified: { type: Boolean, default: false },
    kycVerifiedAt: { type: Date, default: null },
    kycVerifiedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      email: { type: String },
      fullName: { type: String },
    },
    kycVerificationNote: { type: String },
    kycRejected: { type: Boolean, default: false },
    kycRejectedAt: { type: Date, default: null },
    kycRejectedBy: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      email: { type: String },
      fullName: { type: String },
    },
    kycRejectionReason: { type: String },
    kycRejectionNote: { type: String },
    kycBonusAmount: {
      type: Number,
      default: 0,
    },
    kycBonusCreditedAt: {
      type: Date,
      default: null,
    },
    kycLevel: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Business', businessSchema);
