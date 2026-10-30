const mongoose = require('mongoose');

const deletedAccountSchema = new mongoose.Schema(
  {
    originalId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userType: {
      type: String,
      enum: ['buyer', 'provider', 'businessOwner'],
      required: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: { type: String },
    phoneNumber: { type: String },
    data: { type: Object, required: true },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    deletedAt: { type: Date, default: Date.now, index: true },
    mode: {
      type: String,
      enum: ['soft', 'hard'],
      required: true,
    },
    reason: { type: String, default: null },
  },
  { timestamps: false },
);

deletedAccountSchema.index({ email: 1, deletedAt: -1 });
deletedAccountSchema.index({ userType: 1, deletedAt: -1 });

module.exports = mongoose.model('DeletedAccount', deletedAccountSchema);
