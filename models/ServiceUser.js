const mongoose = require ('mongoose');

const serviceUserSchema = new mongoose.Schema ({
    email: { type: String, unique: true, sparse: true },
    phoneNumber: { type: String, unique: true, sparse: true },
    password: { type: String, required: false},
    createdAt: { type: Date, default: Date.now},
    emailVerified: { type: Boolean, default: false },
    otp: { type: String },
     otpExpiresAt: {
  type: Date,
},
lastVerificationOtpSentAt: {
  type: Date,
  default: null,
},
   lastResetOtpSentAt: {
  type: Date,
  default: null,
},   
    isGoogleUser: { type: Boolean, default: false },
    googleId: String,
    refreshToken: { type: String },
    refreshTokenExpiresAt: { type: Date },
    role: {
  type: String,
  enum: ["buyer"],
  default: "buyer",
},
fcmToken: {
    type: String,
    select: false // Don't return in normal queries for security
  },
  device: {
    type: {
      type: String,
      enum: ['ios', 'android', 'web', 'unknown']
    },
    id: String,
    updatedAt: Date
  },
    resetOtp: { type: String },
    resetOtpExpires: { type: Date },
    emailVerificationExpires: { type: Date },
    fullName: { type: String},
    // lastName: { type: String},
    dateOfBirth:{ type: String},
    gender: { type: String},
    city: { type: String },
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'File' }],
    allowSystem: {
      type: Boolean,
      default: false
    },


});

module.exports = mongoose.model ('Buyer', serviceUserSchema);

