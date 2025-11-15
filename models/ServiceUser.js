const mongoose = require ('mongoose');

const serviceUserSchema = new mongoose.Schema ({
    email: { type: String, unique: true, sparse: true },
    phoneNumber: { type: String, unique: true, sparse: true },
    password: { type: String, required: false},
    createdAt: { type: Date, default: Date.now},
    emailVerified: { type: Boolean, default: false },
    otp: { type: String },
    isGoogleUser: { type: Boolean, default: false },
    googleId: String,
    role: {
  type: String,
  enum: ["buyer"],
  default: "buyer",
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


});

module.exports = mongoose.model ('Buyer', serviceUserSchema);

