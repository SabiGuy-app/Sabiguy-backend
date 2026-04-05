const mongoose = require ('mongoose');

const serviceUserSchema = new mongoose.Schema ({
    email: { type: String, unique: true, sparse: true },
    phoneNumber: { type: String, unique: true, sparse: true },
    password: { type: String, required: false},
    createdAt: { type: Date, default: Date.now},
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
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
 currentLocation: {
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],  // [longitude, latitude]
    index: '2dsphere'
  },
  address: String  // Optional
},
  
    notificationPreferences: {
      bookings: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        types: {
          type: [String],
          default: [
            "new_booking_request",
            "provider_accepted",
            "booking_selected",
            "booking_cancelled",
            "booking_status_updated",
            "booking_taken",
            "counter_offer",
          ],
        },
      },
      jobCompleted: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        types: {
          type: [String],
          default: ["job_started", "booking_completed", "job_completed_confirmed"],
        },
      },
      chatMessages: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        types: { type: [String], default: ["new_message", "message_received"] },
      },
      walletPayments: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
        types: {
          type: [String],
          default: [
            "wallet_funded",
            "wallet_payment",
            "payment_received",
            "payment_sent",
          ],
        },
      },
      promotions: {
        push: { type: Boolean, default: false },
        email: { type: Boolean, default: false },
        types: { type: [String], default: ["test"] },
      },
    },


});

module.exports = mongoose.model ('Buyer', serviceUserSchema);

